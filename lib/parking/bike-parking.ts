import "server-only";

import type { BikeParkingSuggestion } from "@/lib/micromobility/types";

type ParkingFeatureResponse = {
  features?: Array<{
    attributes?: {
      OBJECTID?: number;
      Program?: string;
      Borough?: string;
      IFOAddress?: string;
      OnStreet?: string;
      FromStreet?: string;
      ToStreet?: string;
      Side_of_St?: string;
      RackType?: string;
    };
    geometry?: {
      x?: number;
      y?: number;
    };
  }>;
};

type ParkingFeature = NonNullable<ParkingFeatureResponse["features"]>[number];

type CachedParkingResult = {
  expiresAt: number;
  value: Promise<BikeParkingSuggestion[]>;
};

const parkingCache = new Map<string, CachedParkingResult>();
const BIKE_PARKING_QUERY_URL =
  "https://services.arcgis.com/wmZOI9vyUBq1zTZx/arcgis/rest/services/BIKE_RACK_PUBLIC_VIEWER_PROD_gdb/FeatureServer/0/query";

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasRenderableFeature(
  feature: ParkingFeature,
): feature is ParkingFeature & {
  attributes: NonNullable<ParkingFeature["attributes"]>;
  geometry: { x: number; y: number };
} {
  return Boolean(
    feature.attributes?.OBJECTID &&
      feature.geometry?.x !== undefined &&
      feature.geometry?.y !== undefined,
  );
}

export async function getNearbyBikeParking({
  lat,
  lng,
  role = "station",
  radiusMeters = 550,
  limit = 3,
}: {
  lat: number;
  lng: number;
  role?: BikeParkingSuggestion["role"];
  radiusMeters?: number;
  limit?: number;
}): Promise<BikeParkingSuggestion[]> {
  const cacheKey = `${lat.toFixed(3)}:${lng.toFixed(3)}:${role}:${radiusMeters}:${limit}`;
  const cached = parkingCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = new URL(BIKE_PARKING_QUERY_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("where", "1=1");
  url.searchParams.set("geometry", `${lng},${lat}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("distance", String(radiusMeters));
  url.searchParams.set("units", "esriSRUnit_Meter");
  url.searchParams.set(
    "outFields",
    "OBJECTID,Program,Borough,IFOAddress,OnStreet,FromStreet,ToStreet,Side_of_St,RackType",
  );
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("resultRecordCount", String(limit * 4));

  const value = fetch(url, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch bike parking: ${response.status}`);
      }

      return (await response.json()) as ParkingFeatureResponse;
    })
    .then((payload) =>
      (payload.features ?? [])
        .filter(hasRenderableFeature)
        .map((feature) => {
          const point = {
            lat: feature.geometry.y,
            lng: feature.geometry.x,
          };
          const spotDistance = Math.round(distanceMeters({ lat, lng }, point));
          const address =
            feature.attributes.IFOAddress ||
            [
              feature.attributes.OnStreet,
              feature.attributes.FromStreet && feature.attributes.ToStreet
                ? `${feature.attributes.FromStreet} to ${feature.attributes.ToStreet}`
                : undefined,
            ]
              .filter(Boolean)
              .join(", ") ||
            "NYC DOT bike parking";

          return {
            id: String(feature.attributes.OBJECTID),
            source: "nyc-dot",
            role,
            name: address,
            address,
            borough: feature.attributes.Borough || "",
            lat: point.lat,
            lng: point.lng,
            distanceMeters: spotDistance,
            rackType: feature.attributes.RackType || "Bike rack",
            program: feature.attributes.Program || "Bike parking",
            onStreet: feature.attributes.OnStreet,
            fromStreet: feature.attributes.FromStreet,
            toStreet: feature.attributes.ToStreet,
            sideOfStreet: feature.attributes.Side_of_St,
            notes: [
              feature.attributes.Program,
              feature.attributes.RackType,
              feature.attributes.Side_of_St
                ? `${feature.attributes.Side_of_St} side`
                : undefined,
            ]
              .filter(Boolean)
              .join(" | "),
          } satisfies BikeParkingSuggestion;
        })
        .sort((left, right) => left.distanceMeters - right.distanceMeters)
        .slice(0, limit),
    )
    .catch(() => []);

  parkingCache.set(cacheKey, {
    expiresAt: Date.now() + 30 * 60_000,
    value,
  });

  return value;
}
