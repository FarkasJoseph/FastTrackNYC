import "server-only";

import { places, scenarios, type Place, type RouteTemplate } from "@/lib/fasttrack-data";
import { getNearbyCitiBikeStations } from "@/lib/micromobility/citi-bike";
import type {
  PlannerRouteMobilityContext,
  SharedMobilityStationSuggestion,
} from "@/lib/micromobility/types";
import { getNearbyBikeParking } from "@/lib/parking/bike-parking";

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

function getPlace(
  placeId: string,
  route: (typeof scenarios)[number]["routes"][number],
  overrides?: RouteCoordinateOverride,
) {
  const parentScenario = scenarios.find((scenario) =>
    scenario.routes.some((entry) => entry.id === route.id),
  );

  if (parentScenario?.originId === placeId && overrides?.origin) {
    return {
      id: placeId,
      name: "Origin",
      borough: "Manhattan",
      lat: overrides.origin.lat,
      lng: overrides.origin.lng,
      label: "Origin",
    };
  }

  if (parentScenario?.destinationId === placeId && overrides?.destination) {
    return {
      id: placeId,
      name: "Destination",
      borough: "Manhattan",
      lat: overrides.destination.lat,
      lng: overrides.destination.lng,
      label: "Destination",
    };
  }

  const place = places.find((entry) => entry.id === placeId);

  if (!place) {
    throw new Error(`Unknown place: ${placeId}`);
  }

  return place;
}

function dedupeStations(stations: SharedMobilityStationSuggestion[]) {
  const seen = new Set<string>();

  return stations.filter((station) => {
    const key = `${station.role}:${station.name}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getPlaceById(placeId: string, placeList: Place[]) {
  return placeList.find((place) => place.id === placeId);
}

export async function getMicromobilityContextForRoute(
  route: RouteTemplate,
  placeList: Place[],
): Promise<PlannerRouteMobilityContext> {
  const stationSuggestions: SharedMobilityStationSuggestion[] = [];
  const personalLegIndexes = route.legs
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => leg.mode === "personal_micromobility");
  const parkingSuggestionGroups = await Promise.all(
    route.legs.map(async (leg, legIndex) => {
      const toPlace = getPlaceById(leg.toPlaceId, placeList);

      if (!toPlace) {
        throw new Error(`Unknown place: ${leg.toPlaceId}`);
      }

      if (leg.mode === "shared_micromobility") {
        const fromPlace = getPlaceById(leg.fromPlaceId, placeList);

        if (!fromPlace) {
          throw new Error(`Unknown place: ${leg.fromPlaceId}`);
        }

        const [pickupStations, dockStations] = await Promise.all([
          getNearbyCitiBikeStations({
            lat: fromPlace.lat,
            lng: fromPlace.lng,
            role: "pickup",
          }),
          getNearbyCitiBikeStations({
            lat: toPlace.lat,
            lng: toPlace.lng,
            role: "dropoff",
          }),
        ]);

        stationSuggestions.push(...pickupStations, ...dockStations);
      }

      if (leg.mode === "personal_micromobility") {
        const hasLaterPersonalLeg = personalLegIndexes.some(({ index }) => index > legIndex);

        if (hasLaterPersonalLeg) {
          return [];
        }

        const role: "station" | "destination" =
          route.legs[route.legs.length - 1]?.id === leg.id
            ? "destination"
            : "station";
        return getNearbyBikeParking({
          lat: toPlace.lat,
          lng: toPlace.lng,
          role,
        });
      }

      return [];
    }),
  );

  return {
    routeId: route.id,
    fetchedAt: new Date().toISOString(),
    sharedStations: dedupeStations(stationSuggestions),
    parkingSpots: parkingSuggestionGroups.flat(),
  };
}

export async function getPlannerMicromobilityContext(
  routeId: string,
  overrides?: RouteCoordinateOverride,
): Promise<PlannerRouteMobilityContext> {
  const route = scenarios
    .flatMap((scenario) => scenario.routes)
    .find((entry) => entry.id === routeId);

  if (!route) {
    throw new Error(`Unknown planner route: ${routeId}`);
  }

  const stationSuggestions: SharedMobilityStationSuggestion[] = [];
  const personalLegIndexes = route.legs
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => leg.mode === "personal_micromobility");
  const parkingSuggestionGroups = await Promise.all(
    route.legs.map(async (leg, legIndex) => {
      const toPlace = getPlace(leg.toPlaceId, route, overrides);

      if (leg.mode === "shared_micromobility") {
        const fromPlace = getPlace(leg.fromPlaceId, route, overrides);
        const [pickupStations, dockStations] = await Promise.all([
          getNearbyCitiBikeStations({
            lat: fromPlace.lat,
            lng: fromPlace.lng,
            role: "pickup",
          }),
          getNearbyCitiBikeStations({
            lat: toPlace.lat,
            lng: toPlace.lng,
            role: "dropoff",
          }),
        ]);

        stationSuggestions.push(...pickupStations, ...dockStations);
      }

      if (leg.mode === "personal_micromobility") {
        const hasLaterPersonalLeg = personalLegIndexes.some(
          ({ index }) => index > legIndex,
        );

        if (hasLaterPersonalLeg) {
          return [];
        }

        const role: "station" | "destination" =
          route.legs[route.legs.length - 1]?.id === leg.id
            ? "destination"
            : "station";
        const parkingSpots = await getNearbyBikeParking({
          lat: toPlace.lat,
          lng: toPlace.lng,
          role,
        });

        return parkingSpots;
      }

      return [];
    }),
  );

  return {
    routeId,
    fetchedAt: new Date().toISOString(),
    sharedStations: dedupeStations(stationSuggestions),
    parkingSpots: parkingSuggestionGroups.flat(),
  };
}
