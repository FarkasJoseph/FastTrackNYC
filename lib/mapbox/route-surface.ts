import "server-only";

import { places, scenarios, type RouteLeg } from "@/lib/fasttrack-data";
import type { PlannerRouteSurfaceGeometry, RouteSurfaceLegGeometry } from "@/lib/mapbox/types";

type DirectionsProfile = "walking" | "cycling";

type CachedRoute = {
  expiresAt: number;
  value: Promise<{ coordinates: Array<[number, number]>; durationMin: number }>;
};

const routeCache = new Map<string, CachedRoute>();

function getPlaceCoordinates(placeId: string) {
  const place = places.find((entry) => entry.id === placeId);

  if (!place) {
    throw new Error(`Unknown place: ${placeId}`);
  }

  return [place.lng, place.lat] as [number, number];
}

function getDirectionsProfile(leg: RouteLeg): DirectionsProfile | null {
  if (leg.mode === "walk") {
    return "walking";
  }

  if (
    leg.mode === "personal_micromobility" ||
    leg.mode === "shared_micromobility"
  ) {
    return "cycling";
  }

  return null;
}

async function fetchDirectionsGeometry(
  profile: DirectionsProfile,
  from: [number, number],
  to: [number, number],
) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
  }

  const cacheKey = `${profile}:${from.join(",")}=>${to.join(",")}`;
  const cached = routeCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${from[0]},${from[1]};${to[0]},${to[1]}`,
  );
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");
  url.searchParams.set("access_token", token);

  const value = fetch(url, {
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Mapbox directions request failed: ${response.status}`);
    }

      const payload = (await response.json()) as {
      routes?: Array<{
        duration?: number;
        geometry?: {
          coordinates?: Array<[number, number]>;
        };
      }>;
    };
    const route = payload.routes?.[0];
    const coordinates = route?.geometry?.coordinates;

    if (!coordinates || coordinates.length < 2) {
      throw new Error("No usable Mapbox geometry returned.");
    }

    return {
      coordinates,
      durationMin: Math.max(1, Math.round((route?.duration ?? 0) / 60)),
    };
  });

  routeCache.set(cacheKey, {
    expiresAt: Date.now() + 5 * 60_000,
    value,
  });

  return value;
}

export async function getPlannerRouteSurfaceGeometry(
  routeId: string,
): Promise<PlannerRouteSurfaceGeometry> {
  const route = scenarios
    .flatMap((scenario) => scenario.routes)
    .find((entry) => entry.id === routeId);

  if (!route) {
    throw new Error(`Unknown planner route: ${routeId}`);
  }

  const legs = await Promise.all(
    route.legs.map(async (leg) => {
      const profile = getDirectionsProfile(leg);

      if (!profile) {
        return null;
      }

      const from = getPlaceCoordinates(leg.fromPlaceId);
      const to = getPlaceCoordinates(leg.toPlaceId);

      if (from[0] === to[0] && from[1] === to[1]) {
        return null;
      }

      const geometry = await fetchDirectionsGeometry(profile, from, to);

      return {
        legId: leg.id,
        profile,
        coordinates: geometry.coordinates,
        durationMin: geometry.durationMin,
      } satisfies RouteSurfaceLegGeometry;
    }),
  );

  return {
    routeId,
    fetchedAt: new Date().toISOString(),
    legs: legs.filter((leg): leg is RouteSurfaceLegGeometry => Boolean(leg)),
  };
}
