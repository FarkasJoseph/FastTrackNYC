import {
  MicromobilityMode,
  Place,
  PlannerPreferences,
  RouteTemplate,
  Scenario,
  places,
  scenarios,
} from "@/lib/fasttrack-data";

export interface RouteResult extends RouteTemplate {
  rank: number;
  utility: number;
  timeSaved: number;
  walkSaved: number;
  transferSaved: number;
}

export interface PlannerPlan {
  scenario: Scenario;
  recommendedRoute: RouteResult;
  transitOnlyRoute: RouteResult;
  rankedRoutes: RouteResult[];
  placeList: Place[];
  selectedOrigin: TripLocation;
  selectedDestination: TripLocation;
  resolvedByNearestScenario: boolean;
}

export interface TripLocation {
  id: string;
  name: string;
  fullAddress: string;
  lat: number;
  lng: number;
}

const MAX_WALK_MIN = 20;
const NEARBY_SCENARIO_LIMIT = 3;

function routeHasTransit(route: RouteTemplate) {
  return route.legs.some((leg) => leg.mode === "transit" || leg.mode === "bus");
}

function routeHasPersonalMicromobility(route: RouteTemplate) {
  return route.legs.some((leg) => leg.mode === "personal_micromobility");
}

function routeIsBikeWalk(route: RouteTemplate) {
  return !routeHasTransit(route);
}

function routeIsMixed(route: RouteTemplate) {
  return routeHasTransit(route) && routeHasPersonalMicromobility(route);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: Pick<TripLocation, "lat" | "lng">,
  to: Pick<TripLocation | Place, "lat" | "lng">,
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

function scoreRoute(route: RouteTemplate, preferences: PlannerPreferences) {
  const walkPenalty = preferences.goal === "least_walking" ? 2.8 : 1.4;
  const transferPenalty = preferences.goal === "fewest_transfers" ? 12 : 5;
  const micromobilityPenalty = preferences.tripMode === "transit" ? 6.5 : 0.45;
  const costPenalty = 1.2;

  let utility =
    -route.metrics.totalMin -
    route.metrics.walkMin * walkPenalty -
    route.metrics.transfers * transferPenalty -
    route.metrics.micromobilityMin * micromobilityPenalty -
    route.metrics.costUsd * costPenalty +
    route.metrics.confidence * 8;

  if (preferences.goal === "balance" && route.metrics.totalMin <= 32) {
    utility += 4;
  }

  if (preferences.tripMode === "mixed") {
    utility += routeIsMixed(route) ? 18 : -18;
  }

  if (preferences.tripMode === "transit") {
    utility += route.isTransitOnly ? 18 : -18;
  }

  if (preferences.tripMode === "bike_walk") {
    utility += routeIsBikeWalk(route) ? 18 : -18;
  }

  return utility;
}

export function getDestinationsForOrigin(originId: string) {
  return scenarios.filter((scenario) => scenario.originId === originId);
}

export function getScenarioForPlaces(originId: string, destinationId: string) {
  return (
    scenarios.find(
      (scenario) =>
        scenario.originId === originId && scenario.destinationId === destinationId,
    ) ?? scenarios[0]
  );
}

export function createTripLocationFromPlace(placeId: string): TripLocation {
  const place = getPlaceById(placeId, places) ?? places[0];

  return {
    id: place.id,
    name: place.name,
    fullAddress: place.name,
    lat: place.lat,
    lng: place.lng,
  };
}

export function resolveScenarioForLocations(
  origin: TripLocation,
  destination: TripLocation,
) {
  return resolveScenarioCandidatesForLocations(origin, destination, 1)[0] ?? {
    scenario: scenarios[0],
    score: Number.POSITIVE_INFINITY,
  };
}

function resolveScenarioCandidatesForLocations(
  origin: TripLocation,
  destination: TripLocation,
  limit = NEARBY_SCENARIO_LIMIT,
) {
  return scenarios
    .map((scenario) => {
      const scenarioOrigin = getPlaceById(scenario.originId, places) ?? places[0];
      const scenarioDestination =
        getPlaceById(scenario.destinationId, places) ?? places[0];
      return {
        scenario,
        score:
          distanceMeters(origin, scenarioOrigin) +
          distanceMeters(destination, scenarioDestination),
      };
    })
    .sort((left, right) => left.score - right.score)
    .slice(0, limit);
}

function passesWalkConstraints(route: RouteTemplate) {
  return !(
    route.metrics.walkMin > MAX_WALK_MIN ||
    route.legs.some((leg) => leg.mode === "walk" && leg.durationMin > MAX_WALK_MIN)
  );
}

function routeMatchesMicromobilityMode(
  route: RouteTemplate,
  tripMode: PlannerPreferences["tripMode"],
  includeTransitOnly = false,
) {
  if (tripMode === "fastest") {
    return route.micromobilityMode !== "shared";
  }

  if (tripMode === "mixed") {
    return routeIsMixed(route);
  }

  if (tripMode === "transit") {
    return route.isTransitOnly && includeTransitOnly;
  }

  if (tripMode === "bike_walk") {
    return routeIsBikeWalk(route);
  }

  return false;
}

export function buildPlannerPlan(
  origin: TripLocation,
  destination: TripLocation,
  preferences: PlannerPreferences,
): PlannerPlan {
  const exactScenario = scenarios.find(
    (scenario) =>
      scenario.originId === origin.id && scenario.destinationId === destination.id,
  );
  const scenarioCandidates = exactScenario
    ? [
        { scenario: exactScenario, score: 0 },
        ...resolveScenarioCandidatesForLocations(origin, destination).filter(
          (entry) => entry.scenario.id !== exactScenario.id,
        ),
      ].slice(0, NEARBY_SCENARIO_LIMIT)
    : resolveScenarioCandidatesForLocations(origin, destination);
  const scenario = scenarioCandidates[0]?.scenario ?? scenarios[0];
  const transitOnlyRoute =
    scenario.routes.find((route) => route.isTransitOnly) ?? scenario.routes[0];

  const filteredRoutes = scenarioCandidates.flatMap(({ scenario: candidateScenario }) =>
    candidateScenario.routes.filter(
      (route) =>
        passesWalkConstraints(route) &&
          routeMatchesMicromobilityMode(
            route,
            preferences.tripMode,
            candidateScenario.id === scenario.id,
          ),
    ),
  );

  const rankedRoutes = filteredRoutes
    .map((route) => ({
      ...route,
      utility: scoreRoute(route, preferences),
      timeSaved: transitOnlyRoute.metrics.totalMin - route.metrics.totalMin,
      walkSaved: transitOnlyRoute.metrics.walkMin - route.metrics.walkMin,
      transferSaved: transitOnlyRoute.metrics.transfers - route.metrics.transfers,
      rank: 0,
    }))
    .sort((left, right) => right.utility - left.utility)
    .map((route, index) => ({
      ...route,
      rank: index + 1,
    }));

  const topRoute = rankedRoutes[0];
  const shouldPromoteMixedMode =
    !topRoute.isTransitOnly &&
    (topRoute.timeSaved >= 3 ||
      topRoute.transferSaved >= 1 ||
      topRoute.walkSaved >= 7);

  return {
    scenario,
    transitOnlyRoute:
      rankedRoutes.find((route) => route.isTransitOnly) ??
      ({
        ...transitOnlyRoute,
        utility: scoreRoute(transitOnlyRoute, preferences),
        timeSaved: 0,
        walkSaved: 0,
        transferSaved: 0,
        rank: rankedRoutes.length + 1,
      } as RouteResult),
    rankedRoutes,
    recommendedRoute: shouldPromoteMixedMode
      ? topRoute
      : rankedRoutes.find((route) => route.isTransitOnly) ?? topRoute,
    placeList: places.map((place) => {
      if (scenarios.some((candidateScenario) => candidateScenario.originId === place.id)) {
        return {
          ...place,
          name: origin.name,
          lat: origin.lat,
          lng: origin.lng,
          label: "Origin",
        };
      }

      if (
        scenarios.some((candidateScenario) => candidateScenario.destinationId === place.id)
      ) {
        return {
          ...place,
          name: destination.name,
          lat: destination.lat,
          lng: destination.lng,
          label: "Destination",
        };
      }

      return place;
    }),
    selectedOrigin: origin,
    selectedDestination: destination,
    resolvedByNearestScenario: !exactScenario,
  };
}

export function getModeLabel(mode: MicromobilityMode) {
  switch (mode) {
    case "personal":
      return "Personal micromobility";
    case "shared":
      return "Shared micromobility";
    case "avoid":
      return "Transit only";
    default:
      return "Any micromobility";
  }
}

export function getPlaceById(placeId: string, placeList: Place[]) {
  return placeList.find((place) => place.id === placeId);
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function describeRouteDelta(route: RouteResult, transitOnlyRoute: RouteResult) {
  if (route.isTransitOnly) {
    return "Baseline subway-and-walk trip.";
  }

  const benefits: string[] = [];

  if (route.timeSaved > 0) {
    benefits.push(`${route.timeSaved} min faster`);
  }

  if (route.transferSaved > 0) {
    benefits.push(
      route.transferSaved === 1
        ? "removes 1 transfer"
        : `removes ${route.transferSaved} transfers`,
    );
  }

  if (route.walkSaved > 0) {
    benefits.push(`${route.walkSaved} fewer walk min`);
  }

  return benefits.length > 0 ? benefits.join(" | ") : transitOnlyRoute.unlock;
}
