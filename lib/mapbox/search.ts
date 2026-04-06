import "server-only";

const NYC_BBOX = "-74.25909,40.477399,-73.700181,40.917577";

export interface SearchSuggestion {
  mapboxId: string;
  name: string;
  fullAddress: string;
  featureType: string;
}

export interface SearchLocation {
  id: string;
  name: string;
  fullAddress: string;
  lat: number;
  lng: number;
}

type MapboxSuggestResponse = {
  suggestions?: Array<{
    mapbox_id?: string;
    name?: string;
    place_formatted?: string;
    feature_type?: string;
  }>;
};

type MapboxRetrieveResponse = {
  features?: Array<{
    properties?: {
      name?: string;
      full_address?: string;
      coordinates?: {
        latitude?: number;
        longitude?: number;
      };
      feature_type?: string;
      mapbox_id?: string;
    };
  }>;
};

function getMapboxToken() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
  }

  return token;
}

async function fetchMapboxJson<T>(url: URL) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Mapbox search request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function suggestLocations(query: string, sessionToken: string) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [] satisfies SearchSuggestion[];
  }

  const url = new URL("https://api.mapbox.com/search/searchbox/v1/suggest");
  url.searchParams.set("q", trimmedQuery);
  url.searchParams.set("access_token", getMapboxToken());
  url.searchParams.set("session_token", sessionToken);
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", "6");
  url.searchParams.set(
    "types",
    "poi,address,street,neighborhood,locality,place,district",
  );
  url.searchParams.set("country", "US");
  url.searchParams.set("bbox", NYC_BBOX);

  const payload = await fetchMapboxJson<MapboxSuggestResponse>(url);

  return (payload.suggestions ?? [])
    .filter((suggestion) => Boolean(suggestion.mapbox_id && suggestion.name))
    .map((suggestion) => ({
      mapboxId: suggestion.mapbox_id ?? "",
      name: suggestion.name ?? "",
      fullAddress: suggestion.place_formatted ?? suggestion.name,
      featureType: suggestion.feature_type ?? "place",
    }));
}

export async function retrieveLocation(mapboxId: string, sessionToken: string) {
  const url = new URL(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`,
  );
  url.searchParams.set("access_token", getMapboxToken());
  url.searchParams.set("session_token", sessionToken);

  const payload = await fetchMapboxJson<MapboxRetrieveResponse>(url);
  const feature = payload.features?.[0];
  const coordinates = feature?.properties?.coordinates;

  if (
    !feature?.properties?.mapbox_id ||
    !feature.properties.name ||
    coordinates?.latitude === undefined ||
    coordinates.longitude === undefined
  ) {
    throw new Error("Mapbox did not return a usable location.");
  }

  return {
    id: feature.properties.mapbox_id,
    name: feature.properties.name,
    fullAddress: feature.properties.full_address ?? feature.properties.name,
    lat: coordinates.latitude,
    lng: coordinates.longitude,
  } satisfies SearchLocation;
}

type SearchBoxForwardResponse = {
  features?: Array<{
    geometry?: {
      coordinates?: [number, number];
    };
    properties?: {
      mapbox_id?: string;
      name?: string;
      full_address?: string;
      place_formatted?: string;
      feature_type?: string;
      coordinates?: {
        latitude?: number;
        longitude?: number;
        routable_points?: Array<{
          latitude?: number;
          longitude?: number;
        }>;
      };
    };
  }>;
};

export async function searchLocationAutocomplete(query: string) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [] as Array<{
      id: string;
      label: string;
      subtitle: string;
      lat: number;
      lng: number;
      source: "mapbox";
    }>;
  }

  const url = new URL("https://api.mapbox.com/search/searchbox/v1/forward");
  url.searchParams.set("q", trimmedQuery);
  url.searchParams.set("access_token", getMapboxToken());
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", "6");
  url.searchParams.set("auto_complete", "true");
  url.searchParams.set(
    "types",
    "poi,address,street,neighborhood,locality,place,district",
  );
  url.searchParams.set("country", "US");
  url.searchParams.set("bbox", NYC_BBOX);

  const payload = await fetchMapboxJson<SearchBoxForwardResponse>(url);

  return (payload.features ?? [])
    .map((feature) => {
      const routablePoint = feature.properties?.coordinates?.routable_points?.[0];
      const lat =
        routablePoint?.latitude ??
        feature.properties?.coordinates?.latitude ??
        feature.geometry?.coordinates?.[1];
      const lng =
        routablePoint?.longitude ??
        feature.properties?.coordinates?.longitude ??
        feature.geometry?.coordinates?.[0];
      const label = feature.properties?.name;

      if (lat === undefined || lng === undefined || !label) {
        return null;
      }

      return {
        id: feature.properties?.mapbox_id ?? `${label}:${lat}:${lng}`,
        label,
        subtitle:
          feature.properties?.full_address ??
          feature.properties?.place_formatted ??
          label,
        lat,
        lng,
        source: "mapbox" as const,
      };
    })
    .filter((option): option is NonNullable<typeof option> => Boolean(option));
}
