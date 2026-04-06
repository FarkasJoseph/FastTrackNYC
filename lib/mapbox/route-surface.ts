import "server-only";

import { places, scenarios, type Place, type RouteLeg, type RouteTemplate } from "@/lib/fasttrack-data";
import { fetchDirectionsGeometry, type DirectionsProfile } from "@/lib/mapbox/directions";
import type { PlannerRouteSurfaceGeometry, RouteSurfaceLegGeometry } from "@/lib/mapbox/types";
import { getBusShapeSegmentCoordinates } from "@/lib/mta/bus-static";

type RouteCoordinateOverride = {
  origin?: {
    lat: number;
    lng: number;
  };
  destination?: {
    lat: number;
    lng: number;
  };
};

function getDirectionsProfile(leg: RouteLeg): DirectionsProfile | null {
  if (leg.mode === "walk") {
    return "walking";
  }

  if (leg.mode === "bus" && !leg.bus) {
    return "driving";
  }

  if (leg.mode === "personal_micromobility" || leg.mode === "shared_micromobility") {
    return "cycling";
  }

  return null;
}

function getPlaceById(placeId: string, placeList: Place[]) {
  return placeList.find((place) => place.id === placeId);
}

function getLegacyPlaceCoordinates(
  placeId: string,
  route: RouteTemplate,
  overrides?: RouteCoordinateOverride,
) {
  const parentScenario = scenarios.find((scenario) =>
    scenario.routes.some((entry) => entry.id === route.id),
  );

  if (parentScenario?.originId === placeId && overrides?.origin) {
    return [overrides.origin.lng, overrides.origin.lat] as [number, number];
  }

  if (parentScenario?.destinationId === placeId && overrides?.destination) {
    return [overrides.destination.lng, overrides.destination.lat] as [number, number];
  }

  const place = getPlaceById(placeId, places);

  if (!place) {
    throw new Error(`Unknown place: ${placeId}`);
  }

  return [place.lng, place.lat] as [number, number];
}

export async function getRouteSurfaceGeometryForRoute(
  route: RouteTemplate,
  placeList: Place[],
): Promise<PlannerRouteSurfaceGeometry> {
  const legs = await Promise.all(
    route.legs.map(async (leg) => {
      const profile = getDirectionsProfile(leg);

      if (!profile) {
        return null;
      }

      const fromPlace = getPlaceById(leg.fromPlaceId, placeList);
      const toPlace = getPlaceById(leg.toPlaceId, placeList);

      if (!fromPlace || !toPlace) {
        throw new Error(`Missing place coordinates for ${leg.fromPlaceId} or ${leg.toPlaceId}.`);
      }

      if (fromPlace.lng === toPlace.lng && fromPlace.lat === toPlace.lat) {
        return null;
      }

      const geometry =
        leg.mode === "bus" && leg.bus
          ? {
              coordinates: await getBusShapeSegmentCoordinates(
                leg.bus.feedKey as never,
                leg.bus.shapeId,
                leg.bus.originStopId,
                leg.bus.destinationStopId,
              ),
              durationMin: leg.durationMin,
            }
          : await fetchDirectionsGeometry(
              profile!,
              [fromPlace.lng, fromPlace.lat],
              [toPlace.lng, toPlace.lat],
            );

      return {
        legId: leg.id,
        profile: profile ?? "driving",
        coordinates: geometry.coordinates,
        durationMin: geometry.durationMin,
      } satisfies RouteSurfaceLegGeometry;
    }),
  );

  return {
    routeId: route.id,
    fetchedAt: new Date().toISOString(),
    legs: legs.filter((leg): leg is RouteSurfaceLegGeometry => Boolean(leg)),
  };
}

export async function getPlannerRouteSurfaceGeometry(
  routeId: string,
  overrides?: RouteCoordinateOverride,
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

      const from = getLegacyPlaceCoordinates(leg.fromPlaceId, route, overrides);
      const to = getLegacyPlaceCoordinates(leg.toPlaceId, route, overrides);

      if (from[0] === to[0] && from[1] === to[1]) {
        return null;
      }

      const geometry =
        leg.mode === "bus" && leg.bus
          ? {
              coordinates: await getBusShapeSegmentCoordinates(
                leg.bus.feedKey as never,
                leg.bus.shapeId,
                leg.bus.originStopId,
                leg.bus.destinationStopId,
              ),
              durationMin: leg.durationMin,
            }
          : await fetchDirectionsGeometry(profile!, from, to);

      return {
        legId: leg.id,
        profile: profile ?? "driving",
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
