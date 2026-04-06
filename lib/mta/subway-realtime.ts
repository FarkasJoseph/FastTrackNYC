import "server-only";

import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import {
  getMtaDemoReferenceMs,
  getMtaDemoReferenceSeconds,
} from "@/lib/mta/demo-time";
import {
  findTransitPatterns,
  getLineSummaries,
  getShapeCoordinates,
  getShapeSegmentCoordinates,
  getTripStopPathCoordinates,
  getUpcomingScheduledDepartures,
  getStationSummary,
} from "@/lib/mta/subway-static";
import { TransitLegOverride } from "@/lib/mta/leg-overrides";
import { MtaAlertSummary, MtaTransitLegIntel } from "@/lib/mta/types";

const FEED_URLS: Record<string, string> = {
  "1": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "2": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "3": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "4": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "5": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "6": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "6X": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
  "7": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-7",
  "7X": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-7",
  E: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  A: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  C: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  B: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  D: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  F: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  FX: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  M: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  G: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
  J: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  Z: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  L: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
  N: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  Q: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  R: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  W: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
};

const ALERTS_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";
const MTA_API_KEY =
  process.env.MTA_API_KEY ??
  process.env.MTA_API_ACCESS_KEY ??
  process.env.MTA_API_TOKEN;

type CachedValue<T> = {
  expiresAt: number;
  value: Promise<T>;
};

type DecodedFeed = GtfsRealtimeBindings.transit_realtime.IFeedMessage;

const responseCache = new Map<string, CachedValue<Buffer>>();
const decodedFeedCache = new Map<string, CachedValue<DecodedFeed>>();
const alertsCache = new Map<string, CachedValue<MtaAlertSummary[]>>();

function decodePreview(buffer: Buffer, maxLength = 160) {
  return buffer.toString("utf8", 0, Math.min(buffer.length, maxLength)).trim();
}

function isLikelyXmlErrorPayload(buffer: Buffer, contentType: string) {
  const preview = decodePreview(buffer, 80);
  return (
    contentType.includes("xml") ||
    preview.startsWith("<?xml") ||
    preview.startsWith("<Error") ||
    preview.startsWith("<")
  );
}

async function fetchBuffer(url: string, ttlMs: number) {
  const now = Date.now();
  const cached = responseCache.get(url);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = fetch(url, {
    cache: "no-store",
    headers: MTA_API_KEY
      ? {
          "x-api-key": MTA_API_KEY,
        }
      : undefined,
  }).then(async (response) => {
    if (!response.ok) {
      const authHint =
        response.status === 401 || response.status === 403
          ? " MTA realtime feeds now require an API key. Set MTA_API_KEY in your server environment."
          : "";

      throw new Error(`Failed to fetch ${url}: ${response.status}.${authHint}`.trim());
    }

    const contentType = response.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      throw new Error("MTA realtime feed returned an empty response.");
    }

    if (
      contentType.includes("application/json") ||
      contentType.includes("text/html") ||
      isLikelyXmlErrorPayload(buffer, contentType)
    ) {
      const preview = decodePreview(buffer);
      throw new Error(
        `MTA realtime feed returned ${contentType || "non-protobuf content"} instead of GTFS-RT.${preview ? ` Response preview: ${preview}` : ""}`,
      );
    }

    return buffer;
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

  const value = fetchBuffer(url, 15_000).then((buffer) => {
    try {
      return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    } catch (error) {
      const preview = buffer.toString("utf8", 0, Math.min(buffer.length, 120)).trim();

      throw new Error(
        `Failed to decode MTA realtime feed as protobuf.${preview ? ` Response preview: ${preview}` : ""} ${
          error instanceof Error ? error.message : "Unknown decode error."
        }`,
      );
    }
  });

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
      value: fetch(ALERTS_URL, {
        cache: "no-store",
        headers: MTA_API_KEY
          ? {
              "x-api-key": MTA_API_KEY,
            }
          : undefined,
      })
        .then(async (response) => {
          if (!response.ok) {
            const authHint =
              response.status === 401 || response.status === 403
                ? " MTA alert feeds now require an API key. Set MTA_API_KEY in your server environment."
                : "";

            throw new Error(
              `Failed to fetch MTA alerts: ${response.status}.${authHint}`.trim(),
            );
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

async function buildScheduledTransitLegIntel(
  legId: string,
  override: TransitLegOverride,
  patterns: Awaited<ReturnType<typeof findTransitPatterns>>,
  lines: Awaited<ReturnType<typeof getLineSummaries>>,
  fromStation: Awaited<ReturnType<typeof getStationSummary>>,
  toStation: Awaited<ReturnType<typeof getStationSummary>>,
  fallbackShapeId: string | undefined,
  fallbackOriginStopId: string,
  fallbackDestinationStopId: string,
  reason?: string,
  accessLeadMinutes = 0,
): Promise<MtaTransitLegIntel> {
  const scheduledDepartures = await getUpcomingScheduledDepartures(
    override.routeIds,
    override.fromStopId,
    override.toStopId,
    3,
    accessLeadMinutes,
  );

  const departures = scheduledDepartures.map((departure) => {
    const departureInMin = departure.departureInMin;
    const travelMin = Math.max(1, Math.round(departure.travelSeconds / 60));

    return {
      tripId: departure.tripId,
      routeId: departure.routeId,
      headsign: departure.headsign,
      departureAt: new Date(getMtaDemoReferenceMs() + departureInMin * 60_000).toISOString(),
      departureInMin,
      arrivalAt: new Date(
        getMtaDemoReferenceMs() + (departureInMin + travelMin) * 60_000,
      ).toISOString(),
      travelMin,
    };
  });

  const chosenDeparture = scheduledDepartures[0];
  const chosenShapeId = chosenDeparture?.shapeId || fallbackShapeId;
  const chosenTravelMin = chosenDeparture
    ? Math.max(1, Math.round(chosenDeparture.travelSeconds / 60))
    : Math.max(1, Math.round((patterns[0]?.scheduledTravelSeconds ?? 60) / 60));

  const chosenPattern =
    (chosenShapeId
      ? patterns.find((pattern) => pattern.shapeId === chosenShapeId)
      : undefined) ?? patterns[0];
  const shapeCoordinates = chosenShapeId
    ? await getShapeSegmentCoordinates(
        chosenShapeId,
        chosenPattern?.originStopId ?? fallbackOriginStopId,
        chosenPattern?.destinationStopId ?? fallbackDestinationStopId,
      )
    : [];
  const fullShapeCoordinates = chosenShapeId
    ? await getShapeCoordinates(chosenShapeId)
    : [];
  const stopPathCoordinates = chosenPattern?.tripId
    ? await getTripStopPathCoordinates(
        chosenPattern.tripId,
        chosenPattern.originStopId,
        chosenPattern.destinationStopId,
      )
    : [];
  const geometryCoordinates =
    shapeCoordinates.length >= 2 ? shapeCoordinates : stopPathCoordinates;
  const geometryFullCoordinates =
    fullShapeCoordinates.length >= 2 ? fullShapeCoordinates : stopPathCoordinates;
  const geometry =
    geometryCoordinates.length >= 2
      ? {
          source: "schedule" as const,
          coordinates: geometryCoordinates,
          fullCoordinates: geometryFullCoordinates,
        }
      : undefined;

  return {
    legId,
    status: departures.length > 0 ? "ok" : "unavailable",
    reason:
      departures.length > 0
        ? reason
        : "No scheduled departure is available for this leg right now.",
    lines,
    fromStation,
    toStation,
    headsign: chosenDeparture?.headsign ?? patterns[0]?.headsign,
    departureInMin: departures[0]?.departureInMin,
    travelMin: chosenTravelMin,
    departures: departures.slice(0, 3),
    alerts: [],
    geometry,
  };
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
  const fallbackShapeId = patterns[0]?.shapeId || override.shapeId;
  const fallbackOriginStopId = patterns[0]?.originStopId ?? override.fromStopId;
  const fallbackDestinationStopId = patterns[0]?.destinationStopId ?? override.toStopId;

  if (patterns.length === 0 || !fromStation || !toStation) {
    const fallbackGeometry =
      fallbackShapeId && fromStation && toStation
        ? {
            source: "schedule" as const,
            coordinates: await getShapeSegmentCoordinates(
              fallbackShapeId,
              fallbackOriginStopId,
              fallbackDestinationStopId,
            ),
            fullCoordinates: await getShapeCoordinates(fallbackShapeId),
          }
        : undefined;

    return {
      legId,
      status: "unsupported",
      reason: "This transit leg is not yet mapped to a stable subway pattern.",
      lines,
      fromStation: fromStation ?? undefined,
      toStation: toStation ?? undefined,
      departures: [],
      alerts: [],
      geometry: fallbackGeometry,
    };
  }

  const feedUrls = Array.from(
    new Set(
      override.routeIds
        .map((routeId) => FEED_URLS[routeId])
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!MTA_API_KEY || feedUrls.length === 0) {
    return buildScheduledTransitLegIntel(
      legId,
      override,
      patterns,
      lines,
      fromStation,
      toStation,
      fallbackShapeId,
      fallbackOriginStopId,
      fallbackDestinationStopId,
      !MTA_API_KEY ? "Realtime unavailable; showing scheduled service." : undefined,
      accessLeadMinutes,
    );
  }

  try {
    const feeds = await Promise.all(feedUrls.map((url) => getDecodedFeed(url)));
    const nowSeconds = getMtaDemoReferenceSeconds();
    const departures: NonNullable<MtaTransitLegIntel["departures"]> = [];
    let chosenShapeId = patterns[0]?.shapeId || override.shapeId;
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
          chosenShapeId = pattern.shapeId || chosenShapeId;
          chosenHeadsign = pattern.headsign;
        }
      }
    }

    departures.sort((left, right) => left.departureInMin - right.departureInMin);

    if (chosenTravelMin === undefined) {
      chosenTravelMin = Math.max(1, Math.round(patterns[0].scheduledTravelSeconds / 60));
    }

    if (departures.length === 0) {
      return buildScheduledTransitLegIntel(
        legId,
        override,
        patterns,
        lines,
        fromStation,
        toStation,
        fallbackShapeId,
        fallbackOriginStopId,
        fallbackDestinationStopId,
        "Realtime unavailable for this leg; showing scheduled service.",
        accessLeadMinutes,
      );
    }

    const chosenPattern =
      (chosenShapeId
        ? patterns.find((pattern) => pattern.shapeId === chosenShapeId)
        : undefined) ?? patterns[0];
    const shapeCoordinates = chosenShapeId
      ? await getShapeSegmentCoordinates(
          chosenShapeId,
          chosenPattern?.originStopId ?? patterns[0].originStopId,
          chosenPattern?.destinationStopId ?? patterns[0].destinationStopId,
        )
      : [];
    const fullShapeCoordinates = chosenShapeId
      ? await getShapeCoordinates(chosenShapeId)
      : [];
    const stopPathCoordinates = chosenPattern?.tripId
      ? await getTripStopPathCoordinates(
          chosenPattern.tripId,
          chosenPattern.originStopId,
          chosenPattern.destinationStopId,
        )
      : [];
    const geometryCoordinates =
      shapeCoordinates.length >= 2 ? shapeCoordinates : stopPathCoordinates;
    const geometryFullCoordinates =
      fullShapeCoordinates.length >= 2 ? fullShapeCoordinates : stopPathCoordinates;
    const geometry =
      geometryCoordinates.length >= 2
        ? {
            source: departures.length > 0 ? ("realtime" as const) : ("schedule" as const),
            coordinates: geometryCoordinates,
            fullCoordinates: geometryFullCoordinates,
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
  } catch {
    return buildScheduledTransitLegIntel(
      legId,
      override,
      patterns,
      lines,
      fromStation,
      toStation,
      fallbackShapeId,
      fallbackOriginStopId,
      fallbackDestinationStopId,
      "Realtime unavailable for this leg; showing scheduled service.",
      accessLeadMinutes,
    );
  }
}
