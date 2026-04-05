import {
  MicromobilityMode,
  Place,
  PlannerPreferences,
  RouteTemplate,
  Scenario,
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
}

function scoreRoute(route: RouteTemplate, preferences: PlannerPreferences) {
  const walkPenalty = preferences.goal === "least_walking" ? 2.8 : 1.4;
  const transferPenalty = preferences.goal === "fewest_transfers" ? 12 : 5;
  const micromobilityPenalty =
    preferences.micromobilityMode === "avoid" ? 6.5 : 0.45;
  const costPenalty = preferences.micromobilityMode === "shared" ? 1.7 : 1.2;

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

  if (preferences.micromobilityMode === "personal") {
    utility += route.micromobilityMode === "personal" ? 8 : -6;
  }

  if (preferences.micromobilityMode === "shared") {
    utility += route.micromobilityMode === "shared" ? 6 : -4;
  }

  if (preferences.micromobilityMode === "avoid") {
    utility += route.isTransitOnly ? 18 : -18;
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

export function buildPlannerPlan(
  originId: string,
  destinationId: string,
  preferences: PlannerPreferences,
): PlannerPlan {
  const scenario = getScenarioForPlaces(originId, destinationId);
  const transitOnlyRoute =
    scenario.routes.find((route) => route.isTransitOnly) ?? scenario.routes[0];

  const filteredRoutes = scenario.routes.filter((route) => {
    if (preferences.micromobilityMode === "avoid") {
      return route.isTransitOnly;
    }

    if (preferences.micromobilityMode === "personal") {
      return route.isTransitOnly || route.micromobilityMode === "personal";
    }

    if (preferences.micromobilityMode === "shared") {
      return route.isTransitOnly || route.micromobilityMode === "shared";
    }

    return true;
  });

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
    maximumFractionDigits: value % 1 === 0 ? 0 : 1,
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

  return benefits.length > 0 ? benefits.join(" • ") : transitOnlyRoute.unlock;
}
