import "server-only";

import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

export type BusFeedKey = "bronx" | "brooklyn" | "manhattan" | "queens" | "staten-island" | "bus-company";

type RawStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
  location_type?: string;
  parent_station?: string;
};

type RawRoute = {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color?: string;
  route_text_color?: string;
  route_type: string;
};

type RawTrip = {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign: string;
  direction_id?: string;
  shape_id: string;
};

type RawStopTime = {
  trip_id: string;
  stop_id: string;
  arrival_time: string;
  departure_time: string;
  stop_sequence: string;
};

type TripStopTime = {
  stopId: string;
  arrivalTime: string;
  departureTime: string;
  stopSequence: number;
};

type BusStopSummary = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  feedKey: BusFeedKey;
};

type BusRouteSummary = {
  id: string;
  shortName: string;
  longName: string;
};

type BusTrip = {
  id: string;
  routeId: string;
  serviceId: string;
  headsign: string;
  directionId: number | null;
  shapeId: string;
};

export type BusSearchEdge = {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  fromStopId: string;
  toStopId: string;
  travelSeconds: number;
  headsign: string;
  directionId: number | null;
  shapeId: string;
  feedKey: BusFeedKey;
};

export type BusSearchBoardOption = {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  directionId: number | null;
  feedKey: BusFeedKey;
};

export type BusSearchGraph = {
  stops: BusStopSummary[];
  stopById: Map<string, BusStopSummary>;
  edgesByStopId: Map<string, BusSearchEdge[]>;
  boardOptionsByStopId: Map<string, BusSearchBoardOption[]>;
};

type BusStaticData = {
  feedKey: BusFeedKey;
  stopById: Map<string, BusStopSummary>;
  routeById: Map<string, BusRouteSummary>;
  tripById: Map<string, BusTrip>;
  stopTimesByTripId: Map<string, TripStopTime[]>;
  shapeCoordinatesCache: Map<string, Array<[number, number]>>;
  zip: AdmZip;
};

const FEED_URLS: Record<BusFeedKey, string> = {
  bronx: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_bx.zip",
  brooklyn: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip",
  manhattan: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip",
  queens: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip",
  "staten-island": "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_si.zip",
  "bus-company": "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip",
};

const FEED_FILENAME: Record<BusFeedKey, string> = {
  bronx: "gtfs_bx.zip",
  brooklyn: "gtfs_b.zip",
  manhattan: "gtfs_m.zip",
  queens: "gtfs_q.zip",
  "staten-island": "gtfs_si.zip",
  "bus-company": "gtfs_busco.zip",
};

const DOWNLOAD_CACHE_DIR = path.join(process.cwd(), ".cache", "mta-bus");
const DOWNLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const activeFeedCache = new Map<BusFeedKey, Promise<BusStaticData>>();
const graphCache = new Map<string, Promise<BusSearchGraph>>();

function parseCsv<T>(input: string) {
  return parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

function readZipText(zip: AdmZip, entryName: string) {
  const entry = zip.getEntry(entryName);

  if (!entry) {
    throw new Error(`Missing ${entryName} in bus GTFS archive.`);
  }

  return zip.readAsText(entry);
}

function timeToSeconds(value: string) {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

async function ensureBusFeedZip(feedKey: BusFeedKey) {
  fs.mkdirSync(DOWNLOAD_CACHE_DIR, { recursive: true });
  const filename = FEED_FILENAME[feedKey];
  const filePath = path.join(DOWNLOAD_CACHE_DIR, filename);

  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);

    if (Date.now() - stats.mtimeMs < DOWNLOAD_TTL_MS && stats.size > 1_000_000) {
      return filePath;
    }
  }

  const response = await fetch(FEED_URLS[feedKey], { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch MTA bus GTFS for ${feedKey}: ${response.status}`);
  }

  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

async function loadBusStaticData(feedKey: BusFeedKey): Promise<BusStaticData> {
  const zipPath = await ensureBusFeedZip(feedKey);
  const zip = new AdmZip(zipPath);
  const rawStops = parseCsv<RawStop>(readZipText(zip, "stops.txt"));
  const rawRoutes = parseCsv<RawRoute>(readZipText(zip, "routes.txt")).filter(
    (route) => route.route_type === "3",
  );
  const rawTrips = parseCsv<RawTrip>(readZipText(zip, "trips.txt")).filter((trip) =>
    rawRoutes.some((route) => route.route_id === trip.route_id),
  );
  const validTripIds = new Set(rawTrips.map((trip) => trip.trip_id));
  const rawStopTimes = parseCsv<RawStopTime>(readZipText(zip, "stop_times.txt")).filter(
    (stopTime) => validTripIds.has(stopTime.trip_id),
  );

  const stopById = new Map<string, BusStopSummary>();

  for (const stop of rawStops) {
    if (stop.location_type && stop.location_type !== "0") {
      continue;
    }

    stopById.set(stop.stop_id, {
      id: stop.stop_id,
      name: stop.stop_name,
      lat: Number(stop.stop_lat),
      lng: Number(stop.stop_lon),
      feedKey,
    });
  }

  const routeById = new Map<string, BusRouteSummary>();

  for (const route of rawRoutes) {
    routeById.set(route.route_id, {
      id: route.route_id,
      shortName: route.route_short_name || route.route_id,
      longName: route.route_long_name,
    });
  }

  const tripById = new Map<string, BusTrip>();

  for (const trip of rawTrips) {
    tripById.set(trip.trip_id, {
      id: trip.trip_id,
      routeId: trip.route_id,
      serviceId: trip.service_id,
      headsign: trip.trip_headsign,
      directionId:
        trip.direction_id === undefined || trip.direction_id === ""
          ? null
          : Number(trip.direction_id),
      shapeId: trip.shape_id,
    });
  }

  const stopTimesByTripId = new Map<string, TripStopTime[]>();

  for (const stopTime of rawStopTimes) {
    const current = stopTimesByTripId.get(stopTime.trip_id) ?? [];
    current.push({
      stopId: stopTime.stop_id,
      arrivalTime: stopTime.arrival_time,
      departureTime: stopTime.departure_time,
      stopSequence: Number(stopTime.stop_sequence),
    });
    stopTimesByTripId.set(stopTime.trip_id, current);
  }

  for (const [tripId, stopTimes] of stopTimesByTripId.entries()) {
    stopTimes.sort((left, right) => left.stopSequence - right.stopSequence);
    stopTimesByTripId.set(tripId, stopTimes);
  }

  return {
    feedKey,
    stopById,
    routeById,
    tripById,
    stopTimesByTripId,
    shapeCoordinatesCache: new Map(),
    zip,
  };
}

async function getBusStaticData(feedKey: BusFeedKey) {
  const cached = activeFeedCache.get(feedKey) ?? loadBusStaticData(feedKey);

  if (!activeFeedCache.has(feedKey)) {
    activeFeedCache.set(feedKey, cached);
  }

  return cached;
}

export function getBusFeedKeysForBoroughs(boroughs: string[]) {
  const feedKeys = new Set<BusFeedKey>(["bus-company"]);

  for (const borough of boroughs) {
    switch (borough) {
      case "Bronx":
        feedKeys.add("bronx");
        break;
      case "Brooklyn":
        feedKeys.add("brooklyn");
        break;
      case "Queens":
        feedKeys.add("queens");
        break;
      case "Staten Island":
        feedKeys.add("staten-island");
        break;
      default:
        feedKeys.add("manhattan");
        break;
    }
  }

  return [...feedKeys];
}

export async function getBusSearchGraph(feedKeys: BusFeedKey[]): Promise<BusSearchGraph> {
  const cacheKey = [...feedKeys].sort().join("|");
  const cached = graphCache.get(cacheKey) ?? (async () => {
    const datasets = await Promise.all(feedKeys.map((feedKey) => getBusStaticData(feedKey)));
    const stopById = new Map<string, BusStopSummary>();
    const edgeByKey = new Map<string, BusSearchEdge>();
    const boardOptionsByStopSet = new Map<string, Map<string, BusSearchBoardOption>>();

    for (const dataset of datasets) {
      for (const stop of dataset.stopById.values()) {
        stopById.set(stop.id, stop);
      }

      for (const trip of dataset.tripById.values()) {
        const stopTimes = dataset.stopTimesByTripId.get(trip.id);
        const route = dataset.routeById.get(trip.routeId);

        if (!stopTimes || stopTimes.length < 2 || !route) {
          continue;
        }

        for (let index = 0; index < stopTimes.length - 1; index += 1) {
          const currentStop = stopTimes[index];
          const nextStop = stopTimes[index + 1];
          const travelSeconds =
            timeToSeconds(nextStop.arrivalTime) - timeToSeconds(currentStop.departureTime);

          if (travelSeconds <= 0) {
            continue;
          }

          const edgeKey = `${route.id}:${currentStop.stopId}:${nextStop.stopId}:${trip.directionId ?? "x"}`;
          const existing = edgeByKey.get(edgeKey);
          const candidate: BusSearchEdge = {
            routeId: route.id,
            routeShortName: route.shortName,
            routeLongName: route.longName,
            fromStopId: currentStop.stopId,
            toStopId: nextStop.stopId,
            travelSeconds,
            headsign: trip.headsign,
            directionId: trip.directionId,
            shapeId: trip.shapeId,
            feedKey: dataset.feedKey,
          };

          if (!existing || candidate.travelSeconds < existing.travelSeconds) {
            edgeByKey.set(edgeKey, candidate);
          }

          const stopBoardOptions = boardOptionsByStopSet.get(currentStop.stopId) ?? new Map();
          stopBoardOptions.set(`${route.id}:${trip.directionId ?? "x"}`, {
            routeId: route.id,
            routeShortName: route.shortName,
            routeLongName: route.longName,
            directionId: trip.directionId,
            feedKey: dataset.feedKey,
          });
          boardOptionsByStopSet.set(currentStop.stopId, stopBoardOptions);
        }
      }
    }

    const edgesByStopId = new Map<string, BusSearchEdge[]>();

    for (const edge of edgeByKey.values()) {
      const current = edgesByStopId.get(edge.fromStopId) ?? [];
      current.push(edge);
      edgesByStopId.set(edge.fromStopId, current);
    }

    for (const [stopId, edges] of edgesByStopId.entries()) {
      edges.sort((left, right) => left.travelSeconds - right.travelSeconds);
      edgesByStopId.set(stopId, edges);
    }

    const boardOptionsByStopId = new Map<string, BusSearchBoardOption[]>();

    for (const [stopId, options] of boardOptionsByStopSet.entries()) {
      boardOptionsByStopId.set(stopId, [...options.values()]);
    }

    return {
      stops: [...stopById.values()],
      stopById,
      edgesByStopId,
      boardOptionsByStopId,
    } satisfies BusSearchGraph;
  })();

  if (!graphCache.has(cacheKey)) {
    graphCache.set(cacheKey, cached);
  }

  return cached;
}

function findNearestCoordinateIndex(
  coordinates: Array<[number, number]>,
  target: BusStopSummary,
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

export async function getBusShapeCoordinates(feedKey: BusFeedKey, shapeId: string) {
  const data = await getBusStaticData(feedKey);
  const cached = data.shapeCoordinatesCache.get(shapeId);

  if (cached) {
    return cached;
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
    throw new Error("Unexpected bus GTFS shapes.txt header format.");
  }

  const coordinates: Array<{ sequence: number; point: [number, number] }> = [];

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line) {
      continue;
    }

    const columns = line.split(",");
    const candidateShapeId = columns[shapeIdIndex];

    if (candidateShapeId !== shapeId) {
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

export async function getBusShapeSegmentCoordinates(
  feedKey: BusFeedKey,
  shapeId: string,
  originStopId: string,
  destinationStopId: string,
) {
  const data = await getBusStaticData(feedKey);
  const coordinates = await getBusShapeCoordinates(feedKey, shapeId);
  const originStop = data.stopById.get(originStopId);
  const destinationStop = data.stopById.get(destinationStopId);

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
