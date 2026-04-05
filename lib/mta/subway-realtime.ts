import "server-only";

import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import {
  findTransitPatterns,
  getLineSummaries,
  getShapeCoordinates,
  getShapeSegmentCoordinates,
  getUpcomingScheduledDepartures,
  getStationSummary,
} from "@/lib/mta/subway-static";
import { TransitLegOverride } from "@/lib/mta/leg-overrides";
import { MtaAlertSummary, MtaTransitLegIntel } from "@/lib/mta/types";

const FEED_URLS: Record<string, string> = {
  "4": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "5": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "6": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  E: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  J: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  Z: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  N: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  Q: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  R: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  W: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
};

const ALERTS_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";

type CachedValue<T> = {
  expiresAt: number;
  value: Promise<T>;
};

type DecodedFeed = GtfsRealtimeBindings.transit_realtime.IFeedMessage;

const responseCache = new Map<string, CachedValue<Buffer>>();
const decodedFeedCache = new Map<string, CachedValue<DecodedFeed>>();
const alertsCache = new Map<string, CachedValue<MtaAlertSummary[]>>();

async function fetchBuffer(url: string, ttlMs: number) {
  const now = Date.now();
  const cached = responseCache.get(url);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = fetch(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  });

  responseCache.set(url, {
    expiresAt: now + ttlMs,
    value,
  });

  return value;
}

async function getDecodedFeed(url: string) {
  const now = Date.now();
  const cached = decodedFeedCache.get(url);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = fetchBuffer(url, 15_000).then((buffer) =>
    GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer),
  );

  decodedFeedCache.set(url, {
    expiresAt: now + 15_000,
    value,
  });

  return value;
}

function extractTimestamp(
  stopTimeUpdate: GtfsRealtimeBindings.transit_realtime.TripUpdate.IStopTimeUpdate,
  kind: "arrival" | "departure",
) {
  const event = kind === "arrival" ? stopTimeUpdate.arrival : stopTimeUpdate.departure;
  return event?.time ? Number(event.time.toString()) : undefined;
}

async function getAlerts(routeIds: string[], stopIds: string[]) {
  const now = Date.now();
  const cacheKey = `${[...routeIds].sort().join("|")}::${[...stopIds].sort().join("|")}`;
  const cached = alertsCache.get(cacheKey);

  if (!cached || cached.expiresAt <= now) {
    alertsCache.set(cacheKey, {
      expiresAt: now + 30_000,
      value: fetch(ALERTS_URL, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to fetch MTA alerts: ${response.status}`);
          }

          return response.json() as Promise<{
            entity?: Array<{
              id?: string;
              alert?: {
                header_text?: { translation?: Array<{ text?: string; language?: string }> };
                description_text?: {
                  translation?: Array<{ text?: string; language?: string }>;
                };
                informed_entity?: Array<{ route_id?: string; stop_id?: string }>;
                ["transit_realtime.mercury_alert"]?: {
                  alert_type?: string;
                  updated_at?: number;
                };
              };
            }>;
          }>;
        })
        .then((payload) => {
          const entries = payload.entity ?? [];

          return entries
            .filter((entry) => {
              const informedEntities = entry.alert?.informed_entity ?? [];
              return informedEntities.some(
                (entity) =>
                  (entity.route_id && routeIds.includes(entity.route_id)) ||
                  (entity.stop_id && stopIds.includes(entity.stop_id)),
              );
            })
            .slice(0, 3)
            .map((entry) => ({
              id: entry.id ?? "alert",
              header:
                entry.alert?.header_text?.translation?.find(
                  (translation) => translation.language === "en",
                )?.text ?? "Subway service update",
              description:
                entry.alert?.description_text?.translation?.find(
                  (translation) => translation.language === "en",
                )?.text ?? "",
              type:
                entry.alert?.["transit_realtime.mercury_alert"]?.alert_type ??
                "Service change",
              updatedAt: entry.alert?.["transit_realtime.mercury_alert"]?.updated_at
                ? new Date(
                    entry.alert["transit_realtime.mercury_alert"].updated_at * 1000,
                  ).toISOString()
                : undefined,
            }));
        }),
    });
  }

  return alertsCache.get(cacheKey)!.value;
}

export async function getTransitLegIntel(
  legId: string,
  override: TransitLegOverride,
  accessLeadMinutes = 0,
): Promise<MtaTransitLegIntel> {
  const patterns = await findTransitPatterns(
    override.routeIds,
    override.fromStopId,
    override.toStopId,
  );
  const lines = await getLineSummaries(override.routeIds);
  const fromStation = await getStationSummary(override.fromStopId);
  const toStation = await getStationSummary(override.toStopId);

  if (patterns.length === 0 || !fromStation || !toStation) {
    return {
      legId,
      status: "unsupported",
      reason: "This transit leg is not yet mapped to a stable subway pattern.",
      lines,
      departures: [],
      alerts: [],
    };
  }

  const feedUrls = Array.from(
    new Set(
      override.routeIds
        .map((routeId) => FEED_URLS[routeId])
        .filter((value): value is string => Boolean(value)),
    ),
  );

  try {
    const feeds = await Promise.all(feedUrls.map((url) => getDecodedFeed(url)));
    const nowSeconds = Math.floor(Date.now() / 1000);
    const departures: NonNullable<MtaTransitLegIntel["departures"]> = [];
    let chosenShapeId = patterns[0]?.shapeId;
    let chosenHeadsign = patterns[0]?.headsign;
    let chosenTravelMin: number | undefined;
    let chosenDepartureInMin: number | undefined;

    for (const feed of feeds) {
      for (const entity of feed.entity ?? []) {
        const tripUpdate = entity.tripUpdate;
        const tripDescriptor = tripUpdate?.trip;
        const tripId = tripDescriptor?.tripId;
        const routeId = tripDescriptor?.routeId;

        if (!tripUpdate || !tripId || !routeId) {
          continue;
        }

        const pattern = patterns.find((candidate) => candidate.routeId === routeId);

        if (!pattern) {
          continue;
        }

        if (
          pattern.directionId !== null &&
          tripDescriptor.directionId !== undefined &&
          Number(tripDescriptor.directionId) !== pattern.directionId
        ) {
          continue;
        }

        const originUpdate = tripUpdate.stopTimeUpdate?.find(
          (stopTimeUpdate) => stopTimeUpdate.stopId === pattern.originStopId,
        );
        if (!originUpdate) {
          continue;
        }

        const departureSeconds =
          extractTimestamp(originUpdate, "departure") ?? extractTimestamp(originUpdate, "arrival");
        const destinationUpdate = tripUpdate.stopTimeUpdate?.find(
          (stopTimeUpdate) => stopTimeUpdate.stopId === pattern.destinationStopId,
        );
        const arrivalSeconds = destinationUpdate
          ? extractTimestamp(destinationUpdate, "arrival") ??
            extractTimestamp(destinationUpdate, "departure")
          : undefined;

        if (
          !departureSeconds ||
          departureSeconds < nowSeconds + accessLeadMinutes * 60 - 60
        ) {
          continue;
        }

        const departureInMin = Math.max(0, Math.round((departureSeconds - nowSeconds) / 60));
        const travelMin =
          arrivalSeconds && arrivalSeconds > departureSeconds
            ? Math.round((arrivalSeconds - departureSeconds) / 60)
            : Math.round(pattern.scheduledTravelSeconds / 60);

        departures.push({
          tripId,
          routeId,
          headsign: pattern.headsign || tripDescriptor.routeId || routeId,
          departureAt: new Date(departureSeconds * 1000).toISOString(),
          departureInMin,
          arrivalAt: arrivalSeconds ? new Date(arrivalSeconds * 1000).toISOString() : undefined,
          travelMin,
        });

        if (
          chosenDepartureInMin === undefined ||
          departureInMin < chosenDepartureInMin
        ) {
          chosenDepartureInMin = departureInMin;
          chosenTravelMin = travelMin;
          chosenShapeId = pattern.shapeId;
          chosenHeadsign = pattern.headsign;
        }
      }
    }

    departures.sort((left, right) => left.departureInMin - right.departureInMin);

    if (chosenTravelMin === undefined) {
      chosenTravelMin = Math.max(1, Math.round(patterns[0].scheduledTravelSeconds / 60));
    }

    if (departures.length === 0) {
      const scheduledDepartures = await getUpcomingScheduledDepartures(
        override.routeIds,
        override.fromStopId,
        override.toStopId,
        3,
        accessLeadMinutes,
      );

      for (const departure of scheduledDepartures) {
        const departureInMin = departure.departureInMin;
        const travelMin = Math.max(1, Math.round(departure.travelSeconds / 60));

        departures.push({
          tripId: departure.tripId,
          routeId: departure.routeId,
          headsign: departure.headsign,
          departureAt: new Date(Date.now() + departureInMin * 60_000).toISOString(),
          departureInMin,
          arrivalAt: new Date(
            Date.now() + (departureInMin + travelMin) * 60_000,
          ).toISOString(),
          travelMin,
        });

        if (
          chosenDepartureInMin === undefined ||
          departureInMin < chosenDepartureInMin
        ) {
          chosenDepartureInMin = departureInMin;
          chosenTravelMin = travelMin;
          chosenShapeId = departure.shapeId;
          chosenHeadsign = departure.headsign;
        }
      }

      departures.sort((left, right) => left.departureInMin - right.departureInMin);
    }

    const geometry = chosenShapeId
      ? {
          source: departures.length > 0 ? ("realtime" as const) : ("schedule" as const),
          coordinates: await getShapeSegmentCoordinates(
            chosenShapeId,
            patterns.find((pattern) => pattern.shapeId === chosenShapeId)?.originStopId ??
              patterns[0].originStopId,
            patterns.find((pattern) => pattern.shapeId === chosenShapeId)?.destinationStopId ??
              patterns[0].destinationStopId,
          ),
          fullCoordinates: await getShapeCoordinates(chosenShapeId),
        }
      : undefined;
    const alerts = await getAlerts(override.routeIds, [
      override.fromStopId,
      override.toStopId,
    ]);

    return {
      legId,
      status: departures.length > 0 ? "ok" : "unavailable",
      reason:
        departures.length > 0
          ? undefined
          : "No near-term departures were available for this leg.",
      lines,
      fromStation,
      toStation,
      headsign: chosenHeadsign,
      departureInMin: chosenDepartureInMin,
      travelMin: chosenTravelMin,
      departures: departures.slice(0, 3),
      alerts,
      geometry,
    };
  } catch (error) {
    return {
      legId,
      status: "unavailable",
      reason: error instanceof Error ? error.message : "Failed to fetch realtime subway data.",
      lines,
      fromStation,
      toStation,
      departures: [],
      alerts: [],
    };
  }
}
