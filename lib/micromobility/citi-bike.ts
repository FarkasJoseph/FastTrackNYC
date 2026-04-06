import "server-only";

import type { SharedMobilityStationKind, SharedMobilityStationSuggestion } from "@/lib/micromobility/types";

type GbfsFeedCatalog = {
  data?: Record<
    string,
    {
      feeds?: Array<{
        name?: string;
        url?: string;
      }>;
    }
  >;
};

type CitiBikeStationInformation = {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  capacity?: number;
};

type CitiBikeStationStatus = {
  station_id: string;
  is_installed?: 0 | 1;
  is_renting?: 0 | 1;
  is_returning?: 0 | 1;
  num_bikes_available?: number;
  num_ebikes_available?: number;
  num_docks_available?: number;
};

type CitiBikeStationRecord = {
  stationId: string;
  name: string;
  lat: number;
  lng: number;
  capacity?: number;
  isInstalled: boolean;
  isRenting: boolean;
  isReturning: boolean;
  bikesAvailable: number;
  ebikesAvailable: number;
  docksAvailable: number;
};

type CachedValue<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const gbfsCatalogCache = new Map<string, CachedValue<GbfsFeedCatalog>>();
const stationCache = new Map<string, CachedValue<CitiBikeStationRecord[]>>();

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

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "FastTrack NYC",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Citi Bike data: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function getGbfsCatalog() {
  const cacheKey = "catalog";
  const cached = gbfsCatalogCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = fetchJson<GbfsFeedCatalog>("https://gbfs.citibikenyc.com/gbfs/gbfs.json");
  gbfsCatalogCache.set(cacheKey, {
    expiresAt: Date.now() + 5 * 60_000,
    value,
  });

  return value;
}

async function getFeedUrl(feedName: string) {
  const catalog = await getGbfsCatalog();
  const englishFeeds = catalog.data?.en?.feeds ?? [];
  const feed = englishFeeds.find((entry) => entry.name === feedName)?.url;

  if (!feed) {
    throw new Error(`Missing Citi Bike GBFS feed: ${feedName}`);
  }

  return feed;
}

async function getStations() {
  const cacheKey = "stations";
  const cached = stationCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = Promise.all([
    getFeedUrl("station_information"),
    getFeedUrl("station_status"),
  ]).then(async ([stationInformationUrl, stationStatusUrl]) => {
    const [stationInformation, stationStatus] = await Promise.all([
      fetchJson<{ data?: { stations?: CitiBikeStationInformation[] } }>(
        stationInformationUrl,
      ),
      fetchJson<{ data?: { stations?: CitiBikeStationStatus[] } }>(stationStatusUrl),
    ]);

    const statusByStationId = new Map(
      (stationStatus.data?.stations ?? []).map((entry) => [entry.station_id, entry]),
    );

    return (stationInformation.data?.stations ?? []).map((station) => {
      const status = statusByStationId.get(station.station_id);

      return {
        stationId: station.station_id,
        name: station.name,
        lat: station.lat,
        lng: station.lon,
        capacity: station.capacity,
        isInstalled: status?.is_installed === 1,
        isRenting: status?.is_renting === 1,
        isReturning: status?.is_returning === 1,
        bikesAvailable: status?.num_bikes_available ?? 0,
        ebikesAvailable: status?.num_ebikes_available ?? 0,
        docksAvailable: status?.num_docks_available ?? 0,
      } satisfies CitiBikeStationRecord;
    });
  });

  stationCache.set(cacheKey, {
    expiresAt: Date.now() + 60_000,
    value,
  });

  return value;
}

export async function getNearbyCitiBikeStations({
  lat,
  lng,
  role,
  limit = 2,
  maxDistanceMeters = 900,
}: {
  lat: number;
  lng: number;
  role: SharedMobilityStationKind;
  limit?: number;
  maxDistanceMeters?: number;
}): Promise<SharedMobilityStationSuggestion[]> {
  const stations = await getStations();

  const rankedStations = stations
    .map((station) => ({
      station,
      distanceMeters: distanceMeters(
        { lat, lng },
        { lat: station.lat, lng: station.lng },
      ),
    }))
    .filter(({ station, distanceMeters: stationDistance }) => {
      if (!station.isInstalled) {
        return false;
      }

      if (stationDistance > maxDistanceMeters) {
        return false;
      }

      if (role === "pickup") {
        return station.isRenting && station.bikesAvailable > 0;
      }

      return station.isReturning && station.docksAvailable > 0;
    })
    .sort((left, right) => {
      const leftAvailability =
        role === "pickup" ? left.station.bikesAvailable : left.station.docksAvailable;
      const rightAvailability =
        role === "pickup" ? right.station.bikesAvailable : right.station.docksAvailable;

      if (rightAvailability !== leftAvailability) {
        return rightAvailability - leftAvailability;
      }

      return left.distanceMeters - right.distanceMeters;
    })
    .slice(0, limit);

  return rankedStations.map(({ station, distanceMeters: stationDistance }) => ({
    id: `${role}:${station.stationId}`,
    provider: "citi-bike",
    role,
    name: station.name,
    lat: station.lat,
    lng: station.lng,
    distanceMeters: Math.round(stationDistance),
    bikesAvailable: station.bikesAvailable,
    ebikesAvailable: station.ebikesAvailable,
    docksAvailable: station.docksAvailable,
    capacity: station.capacity,
  }));
}
