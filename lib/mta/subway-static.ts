import "server-only";

import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { getMtaDemoReferenceDate } from "@/lib/mta/demo-time";
import { MtaLine, MtaStationSummary } from "@/lib/mta/types";

interface RawStop {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
  location_type?: string;
  parent_station?: string;
}

interface RawRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
  route_text_color: string;
}

interface RawTrip {
  service_id: string;
  route_id: string;
  trip_id: string;
  trip_headsign: string;
  direction_id?: string;
  shape_id: string;
}

interface RawCalendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

interface RawCalendarDate {
  service_id: string;
  date: string;
  exception_type: string;
}

interface RawStopTime {
  trip_id: string;
  stop_id: string;
  arrival_time: string;
  departure_time: string;
  stop_sequence: string;
}

interface RawTransfer {
  from_stop_id: string;
  to_stop_id: string;
  transfer_type?: string;
  min_transfer_time?: string;
}

interface TripStopTime {
  stopId: string;
  arrivalTime: string;
  departureTime: string;
  stopSequence: number;
}

interface StaticTrip {
  id: string;
  serviceId: string;
  routeId: string;
  headsign: string;
  directionId: number | null;
  shapeId: string;
}

export interface TransitPattern {
  routeId: string;
  headsign: string;
  directionId: number | null;
  shapeId: string;
  tripId: string;
  originStopId: string;
  destinationStopId: string;
  scheduledTravelSeconds: number;
}

function prefersPatternCandidate(candidate: TransitPattern, current?: TransitPattern) {
  if (!current) {
    return true;
  }

  const candidateHasShape = candidate.shapeId.trim().length > 0;
  const currentHasShape = current.shapeId.trim().length > 0;

  if (candidateHasShape !== currentHasShape) {
    return candidateHasShape;
  }

  return candidate.scheduledTravelSeconds < current.scheduledTravelSeconds;
}

function prefersSearchEdgeCandidate(candidate: TransitSearchEdge, current?: TransitSearchEdge) {
  if (!current) {
    return true;
  }

  const candidateHasShape = (candidate.shapeId ?? "").trim().length > 0;
  const currentHasShape = (current.shapeId ?? "").trim().length > 0;

  if (candidateHasShape !== currentHasShape) {
    return candidateHasShape;
  }

  return candidate.travelSeconds < current.travelSeconds;
}

export interface TransitSearchEdge {
  routeId: string;
  fromStationId: string;
  toStationId: string;
  travelSeconds: number;
  headsign: string;
  directionId: number | null;
  shapeId: string;
}

export interface TransitSearchBoardOption {
  routeId: string;
  directionId: number | null;
}

export interface TransitSearchTransferEdge {
  fromStationId: string;
  toStationId: string;
  transferSeconds: number;
}

export interface TransitSearchGraph {
  stations: MtaStationSummary[];
  stationById: Map<string, MtaStationSummary>;
  edgesByStationId: Map<string, TransitSearchEdge[]>;
  routeIdsByStationId: Map<string, string[]>;
  boardOptionsByStationId: Map<string, TransitSearchBoardOption[]>;
  transferEdgesByStationId: Map<string, TransitSearchTransferEdge[]>;
}

interface SubwayStaticData {
  linesById: Map<string, MtaLine>;
  stationsById: Map<string, MtaStationSummary>;
  stopsById: Map<string, MtaStationSummary>;
  childStopIdsByStationId: Map<string, string[]>;
  tripsById: Map<string, StaticTrip>;
  tripsByRouteId: Map<string, StaticTrip[]>;
  stopTimesByTripId: Map<string, TripStopTime[]>;
  calendarsByServiceId: Map<string, RawCalendar>;
  calendarDatesByServiceId: Map<string, RawCalendarDate[]>;
  transfers: RawTransfer[];
  shapeCoordinatesCache: Map<string, Array<[number, number]>>;
  zip: AdmZip;
}

const GTFS_ARCHIVE_PATH = path.join(process.cwd(), "gtfs_supplemented.zip");
const SUPPORTED_ROUTE_IDS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "6X",
  "7",
  "7X",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "FX",
  "G",
  "J",
  "L",
  "M",
  "N",
  "Q",
  "R",
  "W",
  "Z",
];

let staticDataPromise: Promise<SubwayStaticData> | undefined;
const patternCache = new Map<string, TransitPattern[]>();
let transitSearchGraphPromise: Promise<TransitSearchGraph> | undefined;

function readZipText(zip: AdmZip, entryName: string) {
  const entry = zip.getEntry(entryName);

  if (!entry) {
    throw new Error(`Missing ${entryName} in ${GTFS_ARCHIVE_PATH}`);
  }

  return zip.readAsText(entry);
}

function parseCsv<T>(input: string) {
  return parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

function timeToSeconds(value: string) {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function getNewYorkDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const parts = formatter.formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    weekday:
      parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "monday",
  };
}

async function loadStaticData(): Promise<SubwayStaticData> {
  if (!fs.existsSync(GTFS_ARCHIVE_PATH)) {
    throw new Error(`Missing GTFS archive at ${GTFS_ARCHIVE_PATH}`);
  }

  const zip = new AdmZip(GTFS_ARCHIVE_PATH);
  const rawStops = parseCsv<RawStop>(readZipText(zip, "stops.txt"));
  const rawRoutes = parseCsv<RawRoute>(readZipText(zip, "routes.txt")).filter((route) =>
    SUPPORTED_ROUTE_IDS.includes(route.route_id),
  );
  const rawCalendars = parseCsv<RawCalendar>(readZipText(zip, "calendar.txt"));
  const rawCalendarDates = parseCsv<RawCalendarDate>(readZipText(zip, "calendar_dates.txt"));
  const rawTransfers = parseCsv<RawTransfer>(readZipText(zip, "transfers.txt"));
  const rawTrips = parseCsv<RawTrip>(readZipText(zip, "trips.txt")).filter((trip) =>
    SUPPORTED_ROUTE_IDS.includes(trip.route_id),
  );

  const stationsById = new Map<string, MtaStationSummary>();
  const stopsById = new Map<string, MtaStationSummary>();
  const childStopIdsByStationId = new Map<string, string[]>();

  for (const stop of rawStops) {
    const lat = Number(stop.stop_lat);
    const lng = Number(stop.stop_lon);
    const locationType = stop.location_type ?? "";

    stopsById.set(stop.stop_id, {
      id: stop.stop_id,
      name: stop.stop_name,
      lat,
      lng,
    });

    if (locationType === "1" || !stop.parent_station) {
      stationsById.set(stop.stop_id, {
        id: stop.stop_id,
        name: stop.stop_name,
        lat,
        lng,
      });
    }

    if (stop.parent_station) {
      const current = childStopIdsByStationId.get(stop.parent_station) ?? [];
      current.push(stop.stop_id);
      childStopIdsByStationId.set(stop.parent_station, current);
    }
  }

  const linesById = new Map<string, MtaLine>();

  for (const route of rawRoutes) {
    linesById.set(route.route_id, {
      id: route.route_id,
      shortName: route.route_short_name,
      longName: route.route_long_name,
      color: `#${route.route_color}`,
      textColor: `#${route.route_text_color}`,
    });
  }

  const tripsById = new Map<string, StaticTrip>();
  const tripsByRouteId = new Map<string, StaticTrip[]>();

  for (const trip of rawTrips) {
    const parsedTrip: StaticTrip = {
      id: trip.trip_id,
      serviceId: trip.service_id,
      routeId: trip.route_id,
      headsign: trip.trip_headsign,
      directionId:
        trip.direction_id === undefined || trip.direction_id === ""
          ? null
          : Number(trip.direction_id),
      shapeId: trip.shape_id,
    };

    tripsById.set(parsedTrip.id, parsedTrip);
    const routeTrips = tripsByRouteId.get(parsedTrip.routeId) ?? [];
    routeTrips.push(parsedTrip);
    tripsByRouteId.set(parsedTrip.routeId, routeTrips);
  }

  const stopTimesByTripId = new Map<string, TripStopTime[]>();
  const validTripIds = new Set(tripsById.keys());
  const rawStopTimes = parseCsv<RawStopTime>(readZipText(zip, "stop_times.txt"));

  for (const stopTime of rawStopTimes) {
    if (!validTripIds.has(stopTime.trip_id)) {
      continue;
    }

    const current = stopTimesByTripId.get(stopTime.trip_id) ?? [];
    current.push({
      stopId: stopTime.stop_id,
      arrivalTime: stopTime.arrival_time,
      departureTime: stopTime.departure_time,
      stopSequence: Number(stopTime.stop_sequence),
    });
    stopTimesByTripId.set(stopTime.trip_id, current);
  }

  for (const [tripId, stopTimes] of stopTimesByTripId) {
    stopTimes.sort((left, right) => left.stopSequence - right.stopSequence);
    stopTimesByTripId.set(tripId, stopTimes);
  }

  const calendarsByServiceId = new Map(
    rawCalendars.map((calendar) => [calendar.service_id, calendar]),
  );
  const calendarDatesByServiceId = new Map<string, RawCalendarDate[]>();

  for (const calendarDate of rawCalendarDates) {
    const current = calendarDatesByServiceId.get(calendarDate.service_id) ?? [];
    current.push(calendarDate);
    calendarDatesByServiceId.set(calendarDate.service_id, current);
  }

  return {
    linesById,
    stationsById,
    stopsById,
    childStopIdsByStationId,
    tripsById,
    tripsByRouteId,
    stopTimesByTripId,
    calendarsByServiceId,
    calendarDatesByServiceId,
    transfers: rawTransfers,
    shapeCoordinatesCache: new Map(),
    zip,
  };
}

export async function getSubwayStaticData() {
  staticDataPromise ??= loadStaticData();
  return staticDataPromise;
}

export async function getStationSummary(stopId: string) {
  const data = await getSubwayStaticData();
  return data.stationsById.get(stopId) ?? data.stopsById.get(stopId);
}

export async function getLineSummaries(routeIds: string[]) {
  const data = await getSubwayStaticData();
  return routeIds
    .map((routeId) => data.linesById.get(routeId))
    .filter((line): line is MtaLine => Boolean(line));
}

export async function getShapeCoordinates(shapeId: string) {
  const data = await getSubwayStaticData();
  const cached = data.shapeCoordinatesCache.get(shapeId);

  if (cached && cached.length > 0) {
    return cached;
  }

  if (cached && cached.length === 0) {
    data.shapeCoordinatesCache.delete(shapeId);
  }

  const content = readZipText(data.zip, "shapes.txt");
  const lines = content.split(/\r?\n/);
  const header = lines[0]?.split(",") ?? [];
  const shapeIdIndex = header.indexOf("shape_id");
  const sequenceIndex = header.indexOf("shape_pt_sequence");
  const latIndex = header.indexOf("shape_pt_lat");
  const lngIndex = header.indexOf("shape_pt_lon");

  if (
    shapeIdIndex === -1 ||
    sequenceIndex === -1 ||
    latIndex === -1 ||
    lngIndex === -1
  ) {
    throw new Error("Unexpected GTFS shapes.txt header format.");
  }

  const normalizedShapeId = shapeId.trim();
  const coordinates: Array<{ sequence: number; point: [number, number] }> = [];

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line) {
      continue;
    }

    const columns = line.split(",");
    const candidateShapeId = columns[shapeIdIndex]?.trim();

    if (candidateShapeId !== normalizedShapeId) {
      continue;
    }

    const lat = Number(columns[latIndex]);
    const lng = Number(columns[lngIndex]);
    const sequence = Number(columns[sequenceIndex]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(sequence)) {
      continue;
    }

    coordinates.push({
      sequence,
      point: [lng, lat],
    });
  }

  coordinates.sort((left, right) => left.sequence - right.sequence);
  const resolved = coordinates.map((entry) => entry.point);
  data.shapeCoordinatesCache.set(shapeId, resolved);
  return resolved;
}

function findNearestCoordinateIndex(
  coordinates: Array<[number, number]>,
  target: MtaStationSummary,
) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < coordinates.length; index += 1) {
    const [lng, lat] = coordinates[index];
    const distance = Math.hypot(lng - target.lng, lat - target.lat);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export async function getShapeSegmentCoordinates(
  shapeId: string,
  originStopId: string,
  destinationStopId: string,
) {
  const data = await getSubwayStaticData();
  const coordinates = await getShapeCoordinates(shapeId);
  const originStop = data.stopsById.get(originStopId) ?? data.stationsById.get(originStopId);
  const destinationStop =
    data.stopsById.get(destinationStopId) ?? data.stationsById.get(destinationStopId);

  if (!originStop || !destinationStop || coordinates.length < 2) {
    return coordinates;
  }

  const originIndex = findNearestCoordinateIndex(coordinates, originStop);
  const destinationIndex = findNearestCoordinateIndex(coordinates, destinationStop);
  const startIndex = Math.min(originIndex, destinationIndex);
  const endIndex = Math.max(originIndex, destinationIndex);
  const segment = coordinates.slice(startIndex, endIndex + 1);

  if (segment.length < 2) {
    return coordinates;
  }

  return originIndex <= destinationIndex ? segment : [...segment].reverse();
}

export async function getTripStopPathCoordinates(
  tripId: string,
  originStopId: string,
  destinationStopId: string,
) {
  const data = await getSubwayStaticData();
  const stopTimes = data.stopTimesByTripId.get(tripId) ?? [];

  if (stopTimes.length < 2) {
    return [] as Array<[number, number]>;
  }

  const originCandidates = new Set<string>([
    originStopId,
    ...(data.childStopIdsByStationId.get(originStopId) ?? []),
  ]);
  const destinationCandidates = new Set<string>([
    destinationStopId,
    ...(data.childStopIdsByStationId.get(destinationStopId) ?? []),
  ]);

  const originParentStation = data.stopsById.get(originStopId)?.id;
  const destinationParentStation = data.stopsById.get(destinationStopId)?.id;

  if (originParentStation) {
    originCandidates.add(originParentStation);
  }

  if (destinationParentStation) {
    destinationCandidates.add(destinationParentStation);
  }

  const originIndex = stopTimes.findIndex((stopTime) => originCandidates.has(stopTime.stopId));
  const destinationIndex = stopTimes.findIndex(
    (stopTime, index) =>
      destinationCandidates.has(stopTime.stopId) && index > originIndex,
  );

  if (originIndex === -1 || destinationIndex === -1) {
    return [] as Array<[number, number]>;
  }

  const segment = stopTimes.slice(originIndex, destinationIndex + 1);
  const coordinates: Array<[number, number]> = [];
  let lastPoint: [number, number] | undefined;

  for (const stopTime of segment) {
    const stop =
      data.stopsById.get(stopTime.stopId) ?? data.stationsById.get(stopTime.stopId);

    if (!stop) {
      continue;
    }

    const point: [number, number] = [stop.lng, stop.lat];

    if (!lastPoint || lastPoint[0] !== point[0] || lastPoint[1] !== point[1]) {
      coordinates.push(point);
      lastPoint = point;
    }
  }

  return coordinates.length >= 2 ? coordinates : [];
}

export async function getActiveServiceIds(date = getMtaDemoReferenceDate()) {
  const data = await getSubwayStaticData();
  const { year, month, day, weekday } = getNewYorkDateParts(date);
  const serviceDate = `${year}${month}${day}`;
  const activeServices = new Set<string>();

  for (const [serviceId, calendar] of data.calendarsByServiceId.entries()) {
    if (serviceDate < calendar.start_date || serviceDate > calendar.end_date) {
      continue;
    }

    const weekdayEnabled = calendar[weekday as keyof RawCalendar];

    if (weekdayEnabled === "1") {
      activeServices.add(serviceId);
    }
  }

  for (const [serviceId, exceptions] of data.calendarDatesByServiceId.entries()) {
    for (const exception of exceptions) {
      if (exception.date !== serviceDate) {
        continue;
      }

      if (exception.exception_type === "1") {
        activeServices.add(serviceId);
      }

      if (exception.exception_type === "2") {
        activeServices.delete(serviceId);
      }
    }
  }

  return activeServices;
}

export interface ScheduledDeparture {
  tripId: string;
  routeId: string;
  headsign: string;
  shapeId: string;
  originStopId: string;
  destinationStopId: string;
  departureSeconds: number;
  arrivalSeconds: number;
  travelSeconds: number;
  departureInMin: number;
}

export async function getUpcomingScheduledDepartures(
  routeIds: string[],
  fromStationId: string,
  toStationId: string,
  limit = 3,
  accessLeadMinutes = 0,
  date = getMtaDemoReferenceDate(),
) {
  const patterns = await findTransitPatterns(routeIds, fromStationId, toStationId);
  const data = await getSubwayStaticData();
  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const currentServiceSeconds =
    Number(nowParts.find((part) => part.type === "hour")?.value ?? "0") * 3600 +
    Number(nowParts.find((part) => part.type === "minute")?.value ?? "0") * 60 +
    Number(nowParts.find((part) => part.type === "second")?.value ?? "0");
  const departures: ScheduledDeparture[] = [];

  for (let dayOffset = 0; dayOffset <= 1 && departures.length < limit; dayOffset += 1) {
    const serviceDate = new Date(date.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const activeServiceIds = await getActiveServiceIds(serviceDate);
    const minimumDepartureSeconds =
      dayOffset === 0
        ? currentServiceSeconds + accessLeadMinutes * 60
        : accessLeadMinutes * 60;

    for (const pattern of patterns) {
      const routeTrips = data.tripsByRouteId.get(pattern.routeId) ?? [];

      for (const trip of routeTrips) {
        if (!activeServiceIds.has(trip.serviceId)) {
          continue;
        }

        const stopTimes = data.stopTimesByTripId.get(trip.id);

        if (!stopTimes) {
          continue;
        }

        const originStop = stopTimes.find((stopTime) => stopTime.stopId === pattern.originStopId);
        const destinationStop = stopTimes.find(
          (stopTime) =>
            stopTime.stopId === pattern.destinationStopId &&
            stopTime.stopSequence > (originStop?.stopSequence ?? -1),
        );

        if (!originStop || !destinationStop) {
          continue;
        }

        const departureSeconds = timeToSeconds(originStop.departureTime);
        const arrivalSeconds = timeToSeconds(destinationStop.arrivalTime);

        if (departureSeconds < minimumDepartureSeconds) {
          continue;
        }

        const relativeDepartureSeconds =
          dayOffset * 24 * 60 * 60 + departureSeconds - currentServiceSeconds;

        departures.push({
          tripId: trip.id,
          routeId: trip.routeId,
          headsign: trip.headsign,
          shapeId: trip.shapeId,
          originStopId: pattern.originStopId,
          destinationStopId: pattern.destinationStopId,
          departureSeconds,
          arrivalSeconds,
          travelSeconds: arrivalSeconds - departureSeconds,
          departureInMin: Math.max(0, Math.round(relativeDepartureSeconds / 60)),
        });
      }
    }
  }

  departures.sort((left, right) => left.departureInMin - right.departureInMin);

  return departures.slice(0, limit);
}

export async function findTransitPatterns(
  routeIds: string[],
  fromStationId: string,
  toStationId: string,
) {
  const cacheKey = `${routeIds.join("|")}::${fromStationId}::${toStationId}`;
  const cached = patternCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const data = await getSubwayStaticData();
  const originStopIds = new Set([
    fromStationId,
    ...(data.childStopIdsByStationId.get(fromStationId) ?? []),
  ]);
  const destinationStopIds = new Set([
    toStationId,
    ...(data.childStopIdsByStationId.get(toStationId) ?? []),
  ]);
  const matches: TransitPattern[] = [];

  for (const routeId of routeIds) {
    const routeTrips = data.tripsByRouteId.get(routeId) ?? [];
    let bestMatch: TransitPattern | undefined;

    for (const trip of routeTrips) {
      const stopTimes = data.stopTimesByTripId.get(trip.id);

      if (!stopTimes) {
        continue;
      }

      const originStop = stopTimes.find((stopTime) => originStopIds.has(stopTime.stopId));

      if (!originStop) {
        continue;
      }

      const destinationStop = stopTimes.find(
        (stopTime) =>
          destinationStopIds.has(stopTime.stopId) &&
          stopTime.stopSequence > originStop.stopSequence,
      );

      if (!destinationStop) {
        continue;
      }

      const travelSeconds =
        timeToSeconds(destinationStop.arrivalTime) -
        timeToSeconds(originStop.departureTime);

      const candidate: TransitPattern = {
        routeId,
        headsign: trip.headsign,
        directionId: trip.directionId,
        shapeId: trip.shapeId,
        tripId: trip.id,
        originStopId: originStop.stopId,
        destinationStopId: destinationStop.stopId,
        scheduledTravelSeconds: travelSeconds,
      };

      if (prefersPatternCandidate(candidate, bestMatch)) {
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
    }
  }

  patternCache.set(cacheKey, matches);
  return matches;
}

function buildChildStopToStationIdMap(data: SubwayStaticData) {
  const childStopToStationId = new Map<string, string>();

  for (const [stationId, childStopIds] of data.childStopIdsByStationId.entries()) {
    for (const childStopId of childStopIds) {
      childStopToStationId.set(childStopId, stationId);
    }
  }

  return childStopToStationId;
}

function getStationIdForStop(
  stopId: string,
  childStopToStationId: Map<string, string>,
  data: SubwayStaticData,
) {
  return childStopToStationId.get(stopId) ?? (data.stationsById.has(stopId) ? stopId : stopId);
}

async function buildTransitSearchGraph(): Promise<TransitSearchGraph> {
  const data = await getSubwayStaticData();
  const childStopToStationId = buildChildStopToStationIdMap(data);
  const edgeByKey = new Map<string, TransitSearchEdge>();
  const routeIdsByStationSet = new Map<string, Set<string>>();
  const boardOptionsByStationSet = new Map<string, Set<string>>();
  const transferEdgeByKey = new Map<string, TransitSearchTransferEdge>();

  for (const trip of data.tripsById.values()) {
    const stopTimes = data.stopTimesByTripId.get(trip.id);

    if (!stopTimes || stopTimes.length < 2) {
      continue;
    }

    for (let index = 0; index < stopTimes.length - 1; index += 1) {
      const currentStop = stopTimes[index];
      const nextStop = stopTimes[index + 1];
      const fromStationId = getStationIdForStop(currentStop.stopId, childStopToStationId, data);
      const toStationId = getStationIdForStop(nextStop.stopId, childStopToStationId, data);

      if (fromStationId === toStationId) {
        continue;
      }

      const travelSeconds =
        timeToSeconds(nextStop.arrivalTime) - timeToSeconds(currentStop.departureTime);

      if (travelSeconds <= 0) {
        continue;
      }

      const edgeKey = `${trip.routeId}:${fromStationId}:${toStationId}`;
      const existingEdge = edgeByKey.get(edgeKey);
      const candidate: TransitSearchEdge = {
        routeId: trip.routeId,
        fromStationId,
        toStationId,
        travelSeconds,
        headsign: trip.headsign,
        directionId: trip.directionId,
        shapeId: trip.shapeId,
      };

      if (
        prefersSearchEdgeCandidate(
          candidate,
          existingEdge,
        )
      ) {
        edgeByKey.set(edgeKey, candidate);
      }

      const fromRoutes = routeIdsByStationSet.get(fromStationId) ?? new Set<string>();
      fromRoutes.add(trip.routeId);
      routeIdsByStationSet.set(fromStationId, fromRoutes);

      const toRoutes = routeIdsByStationSet.get(toStationId) ?? new Set<string>();
      toRoutes.add(trip.routeId);
      routeIdsByStationSet.set(toStationId, toRoutes);

      const boardOptionKey = `${trip.routeId}:${trip.directionId ?? "x"}`;
      const fromBoardOptions =
        boardOptionsByStationSet.get(fromStationId) ?? new Set<string>();
      fromBoardOptions.add(boardOptionKey);
      boardOptionsByStationSet.set(fromStationId, fromBoardOptions);
    }
  }

  const edgesByStationId = new Map<string, TransitSearchEdge[]>();

  for (const edge of edgeByKey.values()) {
    const currentEdges = edgesByStationId.get(edge.fromStationId) ?? [];
    currentEdges.push(edge);
    edgesByStationId.set(edge.fromStationId, currentEdges);
  }

  for (const [stationId, edges] of edgesByStationId.entries()) {
    edges.sort((left, right) => left.travelSeconds - right.travelSeconds);
    edgesByStationId.set(stationId, edges);
  }

  for (const transfer of data.transfers) {
    const fromStationId = getStationIdForStop(
      transfer.from_stop_id,
      childStopToStationId,
      data,
    );
    const toStationId = getStationIdForStop(
      transfer.to_stop_id,
      childStopToStationId,
      data,
    );

    if (
      !fromStationId ||
      !toStationId ||
      fromStationId === toStationId ||
      !data.stationsById.has(fromStationId) ||
      !data.stationsById.has(toStationId)
    ) {
      continue;
    }

    const transferType =
      transfer.transfer_type === undefined || transfer.transfer_type === ""
        ? 0
        : Number(transfer.transfer_type);

    if (Number.isNaN(transferType) || transferType === 3) {
      continue;
    }

    const rawTransferSeconds =
      transfer.min_transfer_time === undefined || transfer.min_transfer_time === ""
        ? 180
        : Number(transfer.min_transfer_time);
    const transferSeconds = Math.max(
      60,
      Number.isNaN(rawTransferSeconds) ? 180 : rawTransferSeconds,
    );
    const transferKey = `${fromStationId}:${toStationId}`;
    const existingTransfer = transferEdgeByKey.get(transferKey);

    if (!existingTransfer || transferSeconds < existingTransfer.transferSeconds) {
      transferEdgeByKey.set(transferKey, {
        fromStationId,
        toStationId,
        transferSeconds,
      });
    }
  }

  const transferEdgesByStationId = new Map<string, TransitSearchTransferEdge[]>();

  for (const transferEdge of transferEdgeByKey.values()) {
    const currentEdges = transferEdgesByStationId.get(transferEdge.fromStationId) ?? [];
    currentEdges.push(transferEdge);
    transferEdgesByStationId.set(transferEdge.fromStationId, currentEdges);
  }

  for (const [stationId, transferEdges] of transferEdgesByStationId.entries()) {
    transferEdges.sort((left, right) => left.transferSeconds - right.transferSeconds);
    transferEdgesByStationId.set(stationId, transferEdges);
  }

  return {
    stations: Array.from(routeIdsByStationSet.keys())
      .map((stationId) => data.stationsById.get(stationId))
      .filter((station): station is MtaStationSummary => Boolean(station)),
    stationById: new Map(data.stationsById.entries()),
    edgesByStationId,
    routeIdsByStationId: new Map(
      Array.from(routeIdsByStationSet.entries()).map(([stationId, routeIds]) => [
        stationId,
        Array.from(routeIds.values()).sort(),
      ]),
    ),
    boardOptionsByStationId: new Map(
      Array.from(boardOptionsByStationSet.entries()).map(([stationId, boardOptions]) => [
        stationId,
        Array.from(boardOptions.values())
          .map((entry) => {
            const [routeId, rawDirectionId] = entry.split(":");
            return {
              routeId,
              directionId: rawDirectionId === "x" ? null : Number(rawDirectionId),
            } satisfies TransitSearchBoardOption;
          })
          .sort(
            (left, right) =>
              left.routeId.localeCompare(right.routeId) ||
              (left.directionId ?? -1) - (right.directionId ?? -1),
          ),
      ]),
    ),
    transferEdgesByStationId,
  };
}

export async function getTransitSearchGraph() {
  transitSearchGraphPromise ??= buildTransitSearchGraph();
  return transitSearchGraphPromise;
}
