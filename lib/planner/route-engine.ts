import "server-only";

import {
  type MicromobilityMode,
  places,
  type Place,
  type PlannerPreferences,
  type RouteLeg,
  type RouteTemplate,
} from "@/lib/fasttrack-data";
import {
  findTransitPatterns,
  getStationSummary,
} from "@/lib/mta/subway-static";
import {
  getTransitNetworkGraph,
  type TransitNetworkEdge,
  type TransitNetworkGraph,
  type TransitNetworkTransferEdge,
} from "@/lib/mta/transit-network";
import { fetchDirectionsGeometry, type DirectionsProfile } from "@/lib/mapbox/directions";
import { getNearbyCitiBikeStations } from "@/lib/micromobility/citi-bike";
import type {
  BikeParkingSuggestion,
  SharedMobilityStationSuggestion,
} from "@/lib/micromobility/types";
import { getNearbyBikeParking } from "@/lib/parking/bike-parking";
import { getBusConnectorCandidates } from "@/lib/planner/bus-connectors";
import {
  resolveScenarioForLocations,
  type PlannerPlan,
  type RouteResult,
  type TripLocation,
} from "@/lib/fasttrack-routing";

const MAX_WALK_MIN = 20;
const MAX_CYCLE_MIN = 18;
const MAX_DIRECT_WALK_MIN = 45;
const MAX_DIRECT_RIDE_MIN = 35;
const MAX_DIRECT_SHARED_TOTAL_MIN = 40;
const MAX_DIRECT_WALK_MIN_BIKE_WALK = 90;
const MAX_DIRECT_SHARED_TOTAL_MIN_BIKE_WALK = 60;
const BOARD_COST_MIN = 4;
const TRANSFER_PENALTY_MIN = 4;
const MAX_BOARDS = 3;
const ACCESS_STATION_CANDIDATE_LIMIT = 12;
const ACCESS_STATION_EVALUATION_LIMIT = 6;
const MAX_ROUTE_VARIANTS_PER_MODE = 2;
const PARKING_BUFFER_MIN = 1;

function routeHasTransit(route: RouteTemplate) {
  return route.legs.some((leg) => leg.mode === "transit" || leg.mode === "bus");
}

function routeHasPersonalMicromobility(route: RouteTemplate) {
  return route.legs.some((leg) => leg.mode === "personal_micromobility");
}

function routeIsMixed(route: RouteTemplate) {
  return routeHasTransit(route) && routeHasPersonalMicromobility(route);
}

function routeIsBikeWalk(route: RouteTemplate) {
  return !routeHasTransit(route);
}

type CandidateLegMode =
  | "walk"
  | "personal_micromobility"
  | "shared_micromobility";

type CandidateStation = {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
  durationMin: number;
  legMode: "walk" | "bus" | "personal_micromobility" | "shared_micromobility";
  lineName?: string;
  details?: string;
};

type SearchState = {
  stationId: string;
  routeId: string | null;
  directionId: number | null;
  boards: number;
};

type SearchAction =
  | { type: "start" }
  | {
      type: "board";
      routeId: string;
      routeShortName: string;
      routeLongName?: string;
      directionId: number | null;
      mode: "transit" | "bus";
      feedKey?: string;
    }
  | { type: "move"; edge: TransitNetworkEdge }
  | { type: "transfer"; edge: TransitNetworkTransferEdge }
  | { type: "alight" };

type SearchNode = {
  costMin: number;
  prevKey?: string;
  state: SearchState;
  action: SearchAction;
};

type TransitSegment = {
  mode: "transit" | "bus";
  routeId: string;
  routeShortName: string;
  routeLongName?: string;
  fromStationId: string;
  toStationId: string;
  directionId: number | null;
  travelSeconds: number;
  headsign: string;
  shapeId?: string;
  feedKey?: string;
};

type TransferSegment = {
  fromStationId: string;
  toStationId: string;
  durationMin: number;
};

type TransitPathStep =
  | { type: "transit"; segment: TransitSegment }
  | { type: "transfer"; segment: TransferSegment };

type TransitPath = {
  steps: TransitPathStep[];
  transitSegments: TransitSegment[];
  transitTravelMin: number;
  transferWalkMin: number;
  transferCount: number;
};

type RouteCandidateResult = {
  totalMin: number;
  access: CandidateStation;
  egress: CandidateStation;
  transitPath: TransitPath;
  accessDurationMin: number;
  egressDurationMin: number;
  sharedRideMin: number;
  availabilityText?: string;
  parkingText?: string;
  confidencePenalty: number;
};

type RouteModeConfig = {
  id: string;
  kind: "transit" | "direct";
  micromobilityMode: MicromobilityMode;
  accessMode: CandidateLegMode;
  egressMode: CandidateLegMode;
  name: string;
  bestFor: string;
  availability: string;
  comfort: string;
  parking: string;
  unlock: string;
};

type RouteSupportContext = {
  accessDurationMin: number;
  egressDurationMin: number;
  sharedRideMin: number;
  availabilityText?: string;
  parkingText?: string;
  confidencePenalty: number;
};

type SupportCaches = {
  sharedStationCache: Map<string, Promise<SharedMobilityStationSuggestion[]>>;
  parkingCache: Map<string, Promise<BikeParkingSuggestion[]>>;
};

type CoordinatePoint = {
  lat: number;
  lng: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: Pick<TripLocation | Place, "lat" | "lng">,
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

function getBoroughForCoordinates(location: Pick<TripLocation | Place, "lat" | "lng">) {
  return [...places].sort(
    (left, right) =>
      distanceMeters(location, left) - distanceMeters(location, right),
  )[0]?.borough ?? "Manhattan";
}

function maxDurationForMode(mode: CandidateLegMode) {
  return mode === "walk" ? MAX_WALK_MIN : MAX_CYCLE_MIN;
}

function costForRoute(
  route: RouteTemplate,
  transitFareUsd: number,
  micromobilityMin: number,
) {
  const hasTransitFare = route.legs.some(
    (leg) => leg.mode === "transit" || leg.mode === "bus",
  );

  let totalCost = hasTransitFare ? transitFareUsd : 0;

  if (
    route.legs.some((leg) => leg.mode === "shared_micromobility")
  ) {
    totalCost += getCitiBikeSingleRideCost(micromobilityMin);
  }

  return totalCost;
}

function getCitiBikeSingleRideCost(rideMinutes: number) {
  const roundedRideMinutes = Math.max(0, Math.ceil(rideMinutes));
  const baseFareUsd = 4.99;
  const includedClassicMinutes = 30;
  const overagePerMinuteUsd = 0.41;

  if (roundedRideMinutes <= includedClassicMinutes) {
    return baseFareUsd;
  }

  return baseFareUsd + (roundedRideMinutes - includedClassicMinutes) * overagePerMinuteUsd;
}

function getDirectionsProfileForMode(mode: CandidateLegMode): DirectionsProfile {
  return mode === "walk" ? "walking" : "cycling";
}

function estimateDurationMin(
  location: Pick<TripLocation | Place, "lat" | "lng">,
  station: Pick<CandidateStation, "lat" | "lng">,
  mode: CandidateLegMode,
) {
  const metersPerMinute = mode === "walk" ? 80 : 220;
  return Math.max(1, Math.round(distanceMeters(location, station) / metersPerMinute));
}

async function getRouteDurationMin(
  profile: DirectionsProfile,
  from: CoordinatePoint,
  to: CoordinatePoint,
  durationCache: Map<string, Promise<number>>,
) {
  const cacheKey = `${profile}:${from.lat},${from.lng}:${to.lat},${to.lng}`;
  const cachedDuration =
    durationCache.get(cacheKey) ??
    fetchDirectionsGeometry(profile, [from.lng, from.lat], [to.lng, to.lat])
      .then((result) => result.durationMin)
      .catch(() => {
        const metersPerMinute = profile === "walking" ? 80 : 220;
        return Math.max(1, Math.round(distanceMeters(from, to) / metersPerMinute));
      });

  if (!durationCache.has(cacheKey)) {
    durationCache.set(cacheKey, cachedDuration);
  }

  return cachedDuration;
}

function buildRouteConfigs(): RouteModeConfig[] {
  return [
    {
      id: "direct-walk",
      kind: "direct",
      micromobilityMode: "avoid",
      accessMode: "walk",
      egressMode: "walk",
      name: "Walk",
      bestFor: "nearby trips",
      availability: "Always available",
      comfort: "Very high",
      parking: "Not needed",
      unlock: "Skips transit entirely when walking is already the quickest option",
    },
    {
      id: "direct-personal",
      kind: "direct",
      micromobilityMode: "personal",
      accessMode: "personal_micromobility",
      egressMode: "personal_micromobility",
      name: "Direct ride",
      bestFor: "short fast trips",
      availability: "Bring your own bike or scooter",
      comfort: "Simple door-to-door ride",
      parking: "Park near your destination",
      unlock: "Skips transit entirely when your own bike or scooter is faster end-to-end",
    },
    {
      id: "direct-shared",
      kind: "direct",
      micromobilityMode: "shared",
      accessMode: "shared_micromobility",
      egressMode: "shared_micromobility",
      name: "Citi Bike",
      bestFor: "shared bike trips",
      availability: "Depends on nearby Citi Bike availability",
      comfort: "Good when pickup and return docks are both convenient",
      parking: "Return at a dock near your destination",
      unlock: "Uses Citi Bike for a direct door-to-door bike/walk trip",
    },
    {
      id: "baseline",
      kind: "transit",
      micromobilityMode: "avoid",
      accessMode: "walk",
      egressMode: "walk",
      name: "Transit + Walk",
      bestFor: "pure transit",
      availability: "Always available",
      comfort: "High",
      parking: "Not needed",
      unlock: "Uses the strongest all-transit path with walking access on both ends",
    },
    {
      id: "personal-first-mile",
      kind: "transit",
      micromobilityMode: "personal",
      accessMode: "personal_micromobility",
      egressMode: "walk",
      name: "Personal micromobility to transit",
      bestFor: "fastest arrival",
      availability: "Bring your own bike or scooter",
      comfort: "Strong time savings with a short ride up front",
      parking: "Leave your bike near the station and finish on foot",
      unlock: "Uses your own micromobility to reach a better station faster",
    },
    {
      id: "personal-last-mile",
      kind: "transit",
      micromobilityMode: "personal",
      accessMode: "walk",
      egressMode: "personal_micromobility",
      name: "Personal micromobility for the final stretch",
      bestFor: "shorter finish",
      availability: "Bring your own bike or scooter",
      comfort: "Keeps the subway simple, then trims the last walk",
      parking: "Bring your bike through transit and park near your destination",
      unlock: "Cuts the final walk after the subway",
    },
    {
      id: "personal-both-sides",
      kind: "transit",
      micromobilityMode: "personal",
      accessMode: "personal_micromobility",
      egressMode: "personal_micromobility",
      name: "Personal micromobility on both sides",
      bestFor: "least walking",
      availability: "Best if you are carrying your own bike or scooter",
      comfort: "Minimizes walking before and after transit",
      parking: "Bring your bike through transit and park near the destination",
      unlock: "Uses personal micromobility before and after the subway",
    },
  ];
}

function scoreRoute(route: RouteTemplate, preferences: PlannerPreferences) {
  let utility =
    -route.metrics.totalMin -
    route.metrics.walkMin * 1.5 -
    route.metrics.transfers * 8 -
    route.metrics.costUsd * 1.15 +
    route.metrics.confidence * 6;

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

function stateKey(state: SearchState) {
  return `${state.stationId}|${state.routeId ?? "off"}|${state.directionId ?? "x"}|${state.boards}`;
}

function reconstructTransitPath(
  bestByKey: Map<string, SearchNode>,
  finalNode: SearchNode,
) {
  const chain: SearchNode[] = [];
  let current: SearchNode | undefined = finalNode;

  while (current) {
    chain.push(current);
    current = current.prevKey ? bestByKey.get(current.prevKey) : undefined;
  }

  chain.reverse();

  const transitSegments: TransitSegment[] = [];
  const transferSegments: TransferSegment[] = [];
  const steps: TransitPathStep[] = [];
  let activeSegment: TransitSegment | null = null;
  let transitTravelMin = 0;
  let transferWalkMin = 0;

  for (let index = 1; index < chain.length; index += 1) {
    const node = chain[index];

    if (node.action.type === "board") {
        activeSegment = {
        mode: node.action.mode,
          routeId: node.action.routeId,
          routeShortName: node.action.routeShortName,
          routeLongName: node.action.routeLongName,
          fromStationId: chain[index - 1].state.stationId,
          toStationId: chain[index - 1].state.stationId,
          directionId: node.action.directionId,
          travelSeconds: 0,
          headsign: "",
          shapeId: undefined,
          feedKey: node.action.feedKey,
        };
      }

      if (node.action.type === "move" && activeSegment) {
        activeSegment.toStationId = node.action.edge.toNodeId;
        activeSegment.travelSeconds += node.action.edge.travelSeconds;
        activeSegment.headsign = node.action.edge.headsign;
        activeSegment.shapeId = node.action.edge.shapeId;
        transitTravelMin += Math.round(node.action.edge.travelSeconds / 60);
      }

    if (node.action.type === "alight" && activeSegment) {
      transitSegments.push(activeSegment);
      steps.push({
        type: "transit",
        segment: activeSegment,
      });
      activeSegment = null;
    }

    if (node.action.type === "transfer") {
      const transferSegment = {
        fromStationId: node.action.edge.fromStationId,
        toStationId: node.action.edge.toStationId,
        durationMin: Math.max(1, Math.round(node.action.edge.transferSeconds / 60)),
      } satisfies TransferSegment;
      transferSegments.push(transferSegment);
      steps.push({
        type: "transfer",
        segment: transferSegment,
      });
      transferWalkMin += transferSegment.durationMin;
    }
  }

  return {
    steps,
    transitSegments,
    transitTravelMin,
    transferWalkMin,
    transferCount: Math.max(0, transitSegments.length - 1),
  } satisfies TransitPath;
}

function searchTransitPath(
  originStationId: string,
  destinationStationId: string,
  graph: TransitNetworkGraph,
) {
  const startState: SearchState = {
    stationId: originStationId,
    routeId: null,
    directionId: null,
    boards: 0,
  };
  const bestByKey = new Map<string, SearchNode>([
    [
      stateKey(startState),
      {
        costMin: 0,
        state: startState,
        action: { type: "start" },
      },
    ],
  ]);
  const frontier: SearchNode[] = [bestByKey.get(stateKey(startState))!];

  while (frontier.length > 0) {
    frontier.sort((left, right) => left.costMin - right.costMin);
    const currentNode = frontier.shift();

    if (!currentNode) {
      break;
    }

    const currentBest = bestByKey.get(stateKey(currentNode.state));

    if (!currentBest || currentBest.costMin !== currentNode.costMin) {
      continue;
    }

    if (
      currentNode.state.routeId === null &&
      currentNode.state.stationId === destinationStationId &&
      currentNode.state.boards > 0
    ) {
      return reconstructTransitPath(bestByKey, currentNode);
    }

    if (currentNode.state.routeId === null) {
      const transferEdges =
        graph.transferEdgesByNodeId.get(currentNode.state.stationId) ?? [];

      for (const transferEdge of transferEdges) {
        const nextState: SearchState = {
          stationId: transferEdge.toStationId,
          routeId: null,
          directionId: null,
          boards: currentNode.state.boards,
        };
        const nextCost = currentNode.costMin + transferEdge.transferSeconds / 60;
        const nextKey = stateKey(nextState);
        const existing = bestByKey.get(nextKey);

        if (!existing || nextCost < existing.costMin) {
          const nextNode: SearchNode = {
            costMin: nextCost,
            prevKey: stateKey(currentNode.state),
            state: nextState,
            action: {
              type: "transfer",
              edge: transferEdge,
            },
          };
          bestByKey.set(nextKey, nextNode);
          frontier.push(nextNode);
        }
      }

      if (currentNode.state.boards >= MAX_BOARDS) {
        continue;
      }

      const boardOptions =
        graph.boardOptionsByNodeId.get(currentNode.state.stationId) ?? [];

      for (const option of boardOptions) {
        const nextState: SearchState = {
          stationId: currentNode.state.stationId,
          routeId: option.routeId,
          directionId: option.directionId,
          boards: currentNode.state.boards + 1,
        };
        const nextCost =
          currentNode.costMin +
          BOARD_COST_MIN +
          (currentNode.state.boards > 0 ? TRANSFER_PENALTY_MIN : 0);
        const nextKey = stateKey(nextState);
        const existing = bestByKey.get(nextKey);

        if (!existing || nextCost < existing.costMin) {
          const nextNode: SearchNode = {
            costMin: nextCost,
            prevKey: stateKey(currentNode.state),
            state: nextState,
            action: {
              type: "board",
              routeId: option.routeId,
              routeShortName: option.routeShortName,
              routeLongName: option.routeLongName,
              directionId: option.directionId,
              mode: option.mode,
              feedKey: option.feedKey,
            },
          };
          bestByKey.set(nextKey, nextNode);
          frontier.push(nextNode);
        }
      }

      continue;
    }

    const moveEdges =
      graph.edgesByNodeId
        .get(currentNode.state.stationId)
        ?.filter(
          (edge) =>
            edge.routeId === currentNode.state.routeId &&
            edge.directionId === currentNode.state.directionId,
        ) ?? [];

    for (const edge of moveEdges) {
      const nextState: SearchState = {
        stationId: edge.toNodeId,
        routeId: currentNode.state.routeId,
        directionId: currentNode.state.directionId,
        boards: currentNode.state.boards,
      };
      const nextCost = currentNode.costMin + edge.travelSeconds / 60;
      const nextKey = stateKey(nextState);
      const existing = bestByKey.get(nextKey);

      if (!existing || nextCost < existing.costMin) {
        const nextNode: SearchNode = {
          costMin: nextCost,
          prevKey: stateKey(currentNode.state),
          state: nextState,
          action: { type: "move", edge },
        };
        bestByKey.set(nextKey, nextNode);
        frontier.push(nextNode);
      }
    }

    const alightState: SearchState = {
      stationId: currentNode.state.stationId,
      routeId: null,
      directionId: null,
      boards: currentNode.state.boards,
    };
    const alightKey = stateKey(alightState);
    const existingAlight = bestByKey.get(alightKey);

    if (!existingAlight || currentNode.costMin < existingAlight.costMin) {
      const nextNode: SearchNode = {
        costMin: currentNode.costMin,
        prevKey: stateKey(currentNode.state),
        state: alightState,
        action: { type: "alight" },
      };
      bestByKey.set(alightKey, nextNode);
      frontier.push(nextNode);
    }
  }

  return null;
}

async function getStationCandidates(
  location: TripLocation,
  mode: CandidateLegMode,
  role: "origin" | "destination",
  graph: TransitNetworkGraph,
  durationCache: Map<string, Promise<number>>,
) {
  const nearestStations = [...graph.nodes]
    .sort((left, right) => distanceMeters(location, left) - distanceMeters(location, right))
    .slice(0, ACCESS_STATION_CANDIDATE_LIMIT);
  const maxDuration = maxDurationForMode(mode);
  const profile = getDirectionsProfileForMode(mode);

  const resolvedStations = await Promise.all(
    nearestStations.map(async (station) => {
      const cacheKey = `${profile}:${location.lat},${location.lng}:${station.id}`;
      const cachedDuration =
        durationCache.get(cacheKey) ??
        fetchDirectionsGeometry(
          profile,
          [location.lng, location.lat],
          [station.lng, station.lat],
        )
          .then((result) => result.durationMin)
          .catch(() => estimateDurationMin(location, station, mode));

      if (!durationCache.has(cacheKey)) {
        durationCache.set(cacheKey, cachedDuration);
      }

      return {
        stationId: station.id,
        stationName: station.name,
        lat: station.lat,
        lng: station.lng,
        durationMin: await cachedDuration,
        legMode: mode,
      } satisfies CandidateStation;
    }),
  );

  const stationCandidates = resolvedStations
    .filter((station) => station.durationMin <= maxDuration)
    .sort((left, right) => left.durationMin - right.durationMin)
    .slice(0, ACCESS_STATION_EVALUATION_LIMIT);

  if (mode !== "walk") {
    return stationCandidates;
  }

  const busConnectorCandidates = getBusConnectorCandidates(location, role)
    .map((connector) => {
      const station = graph.nodeById.get(connector.stationId);
      if (!station) {
        return null;
      }

      return {
        stationId: station.id,
        stationName: station.name,
        lat: station.lat,
        lng: station.lng,
        durationMin: connector.durationMin,
        legMode: "bus" as const,
        lineName: connector.routeLabel,
        details: connector.details,
      } satisfies CandidateStation;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  return [...stationCandidates, ...busConnectorCandidates]
    .sort((left, right) => left.durationMin - right.durationMin)
    .slice(0, ACCESS_STATION_EVALUATION_LIMIT);
}

function getSharedStationCacheKey(
  lat: number,
  lng: number,
  role: "pickup" | "dropoff",
) {
  return `${role}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

async function getCachedSharedStations(
  caches: SupportCaches,
  lat: number,
  lng: number,
  role: "pickup" | "dropoff",
) {
  const cacheKey = getSharedStationCacheKey(lat, lng, role);
  const cached =
    caches.sharedStationCache.get(cacheKey) ??
    getNearbyCitiBikeStations({
      lat,
      lng,
      role,
    }).catch(() => []);

  if (!caches.sharedStationCache.has(cacheKey)) {
    caches.sharedStationCache.set(cacheKey, cached);
  }

  return cached;
}

function getParkingCacheKey(lat: number, lng: number, role: "station" | "destination") {
  return `${role}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

async function getCachedParkingSpots(
  caches: SupportCaches,
  lat: number,
  lng: number,
  role: "station" | "destination",
) {
  const cacheKey = getParkingCacheKey(lat, lng, role);
  const cached =
    caches.parkingCache.get(cacheKey) ??
    getNearbyBikeParking({
      lat,
      lng,
      role,
    }).catch(() => []);

  if (!caches.parkingCache.has(cacheKey)) {
    caches.parkingCache.set(cacheKey, cached);
  }

  return cached;
}

async function getRouteSupportContext(
  config: RouteModeConfig,
  origin: TripLocation,
  destination: TripLocation,
  accessStation: CandidateStation,
  egressStation: CandidateStation,
  caches: SupportCaches,
  durationCache: Map<string, Promise<number>>,
): Promise<RouteSupportContext | null> {
  let accessDurationMin = accessStation.durationMin;
  let egressDurationMin = egressStation.durationMin;
  let sharedRideMin = 0;
  let availabilityText: string | undefined;
  let parkingText: string | undefined;
  let confidencePenalty = 0;

  if (config.accessMode === "shared_micromobility") {
    const [pickupStations, dropoffStations] = await Promise.all([
      getCachedSharedStations(caches, origin.lat, origin.lng, "pickup"),
      getCachedSharedStations(caches, accessStation.lat, accessStation.lng, "dropoff"),
    ]);
    const sharedAccessCandidates = await Promise.all(
      pickupStations.flatMap((pickup) =>
        dropoffStations.map(async (dropoff) => {
          const [walkToPickupMin, rideToDockMin, walkToStationMin] = await Promise.all([
            getRouteDurationMin("walking", origin, pickup, durationCache),
            getRouteDurationMin("cycling", pickup, dropoff, durationCache),
            getRouteDurationMin("walking", dropoff, accessStation, durationCache),
          ]);

          return {
            pickup,
            dropoff,
            rideToDockMin,
            totalMin: walkToPickupMin + rideToDockMin + walkToStationMin,
          };
        }),
      ),
    );
    const bestSharedAccess = sharedAccessCandidates.sort(
      (left, right) => left.totalMin - right.totalMin,
    )[0];

    if (!bestSharedAccess) {
      return null;
    }

    accessDurationMin = bestSharedAccess.totalMin;
    sharedRideMin += bestSharedAccess.rideToDockMin;
    availabilityText = `Shared route uses Citi Bike pickup at ${bestSharedAccess.pickup.name} and return at ${bestSharedAccess.dropoff.name}.`;
    confidencePenalty += bestSharedAccess.pickup.bikesAvailable <= 2 ? 0.05 : 0;
    confidencePenalty += bestSharedAccess.dropoff.docksAvailable <= 2 ? 0.05 : 0;
  }

  if (config.egressMode === "shared_micromobility") {
    const [pickupStations, dropoffStations] = await Promise.all([
      getCachedSharedStations(caches, egressStation.lat, egressStation.lng, "pickup"),
      getCachedSharedStations(caches, destination.lat, destination.lng, "dropoff"),
    ]);
    const sharedEgressCandidates = await Promise.all(
      pickupStations.flatMap((pickup) =>
        dropoffStations.map(async (dropoff) => {
          const [walkToPickupMin, rideToDockMin, walkToDestinationMin] =
            await Promise.all([
              getRouteDurationMin("walking", egressStation, pickup, durationCache),
              getRouteDurationMin("cycling", pickup, dropoff, durationCache),
              getRouteDurationMin("walking", dropoff, destination, durationCache),
            ]);

          return {
            pickup,
            dropoff,
            rideToDockMin,
            totalMin: walkToPickupMin + rideToDockMin + walkToDestinationMin,
          };
        }),
      ),
    );
    const bestSharedEgress = sharedEgressCandidates.sort(
      (left, right) => left.totalMin - right.totalMin,
    )[0];

    if (!bestSharedEgress) {
      return null;
    }

    egressDurationMin = bestSharedEgress.totalMin;
    sharedRideMin += bestSharedEgress.rideToDockMin;
    availabilityText = availabilityText
      ? `${availabilityText} Finish with Citi Bike pickup at ${bestSharedEgress.pickup.name} and return at ${bestSharedEgress.dropoff.name}.`
      : `Shared route finishes with Citi Bike pickup at ${bestSharedEgress.pickup.name} and return at ${bestSharedEgress.dropoff.name}.`;
    confidencePenalty += bestSharedEgress.pickup.bikesAvailable <= 2 ? 0.05 : 0;
    confidencePenalty += bestSharedEgress.dropoff.docksAvailable <= 2 ? 0.05 : 0;
  }

  const needsStationParking =
    config.accessMode === "personal_micromobility" &&
    config.egressMode !== "personal_micromobility";
  const needsDestinationParking = config.egressMode === "personal_micromobility";

  if (needsStationParking) {
    const parkingSpots = await getCachedParkingSpots(
      caches,
      accessStation.lat,
      accessStation.lng,
      "station",
    );
    const parkingSpot = parkingSpots[0];

    if (!parkingSpot) {
      return null;
    }

    accessDurationMin += PARKING_BUFFER_MIN;
    parkingText = `Bike parking available near ${accessStation.stationName} at ${parkingSpot.name}.`;
  }

  if (needsDestinationParking) {
    const parkingSpots = await getCachedParkingSpots(
      caches,
      destination.lat,
      destination.lng,
      "destination",
    );
    const parkingSpot = parkingSpots[0];

    if (!parkingSpot) {
      return null;
    }

    egressDurationMin += PARKING_BUFFER_MIN;
    parkingText = parkingText
      ? `${parkingText} Destination parking at ${parkingSpot.name}.`
      : `Destination parking at ${parkingSpot.name}.`;
  }

  return {
    accessDurationMin,
    egressDurationMin,
    sharedRideMin,
    availabilityText,
    parkingText,
    confidencePenalty,
  };
}

async function buildTransitPathLegs(
  routeId: string,
  transitPath: TransitPath,
  graph: TransitNetworkGraph,
) {
  const legs: RouteLeg[] = [];
  let transitIndex = 0;
  let transferIndex = 0;

  for (const step of transitPath.steps) {
    if (step.type === "transit") {
      if (step.segment.mode === "transit") {
        const [pattern, fromStation, toStation] = await Promise.all([
          findTransitPatterns(
            [step.segment.routeId],
            step.segment.fromStationId,
            step.segment.toStationId,
          ),
          getStationSummary(step.segment.fromStationId),
          getStationSummary(step.segment.toStationId),
        ]);
        const selectedPattern = pattern[0];

        legs.push({
          id: `${routeId}-transit-${transitIndex + 1}-${step.segment.routeId}-${step.segment.fromStationId}-${step.segment.toStationId}`,
          mode: "transit",
          fromPlaceId: step.segment.fromStationId,
          toPlaceId: step.segment.toStationId,
          durationMin: Math.max(
            1,
            Math.round(
              (selectedPattern?.scheduledTravelSeconds ?? step.segment.travelSeconds) / 60,
            ),
          ),
          label: "Subway",
          lineName: selectedPattern?.routeId ?? step.segment.routeShortName,
          details: `${
            selectedPattern?.routeId ?? step.segment.routeShortName
          } from ${fromStation?.name ?? step.segment.fromStationId} to ${
            toStation?.name ?? step.segment.toStationId
          }.`,
          mta: {
            routeIds: [selectedPattern?.routeId ?? step.segment.routeId],
            originStopId: step.segment.fromStationId,
            destinationStopId: step.segment.toStationId,
            direction:
              (selectedPattern?.directionId ?? step.segment.directionId) === 1 ? "S" : "N",
            shapeId: selectedPattern?.shapeId ?? step.segment.shapeId,
          },
        } satisfies RouteLeg);
      } else {
        const fromNode = graph.nodeById.get(step.segment.fromStationId);
        const toNode = graph.nodeById.get(step.segment.toStationId);

        legs.push({
          id: `${routeId}-bus-${transitIndex + 1}-${step.segment.routeId}-${step.segment.fromStationId}-${step.segment.toStationId}`,
          mode: "bus",
          fromPlaceId: step.segment.fromStationId,
          toPlaceId: step.segment.toStationId,
          durationMin: Math.max(1, Math.round(step.segment.travelSeconds / 60)),
          label: "Bus",
          lineName: step.segment.routeShortName,
          details: `${step.segment.routeShortName} from ${fromNode?.name ?? step.segment.fromStationId} to ${toNode?.name ?? step.segment.toStationId}.`,
          bus: step.segment.shapeId && step.segment.feedKey
            ? {
                routeId: step.segment.routeId,
                routeShortName: step.segment.routeShortName,
                originStopId: step.segment.fromStationId,
                destinationStopId: step.segment.toStationId,
                shapeId: step.segment.shapeId,
                feedKey: step.segment.feedKey,
                headsign: step.segment.headsign,
              }
            : undefined,
        } satisfies RouteLeg);
      }
      transitIndex += 1;
      continue;
    }

    const fromStation = graph.nodeById.get(step.segment.fromStationId);
    const toStation = graph.nodeById.get(step.segment.toStationId);

    legs.push({
      id: `${routeId}-transfer-${transferIndex + 1}-${step.segment.fromStationId}-${step.segment.toStationId}`,
      mode: "walk",
      fromPlaceId: step.segment.fromStationId,
      toPlaceId: step.segment.toStationId,
      durationMin: step.segment.durationMin,
      label: "Walk",
      details:
        fromStation?.name && toStation?.name && fromStation.name === toStation.name
          ? `Transfer on foot within ${fromStation.name}.`
          : `Transfer on foot from ${fromStation?.name ?? step.segment.fromStationId} to ${
              toStation?.name ?? step.segment.toStationId
            }.`,
    } satisfies RouteLeg);
    transferIndex += 1;
  }

  return legs;
}

async function materializeRouteCandidate(
  config: RouteModeConfig,
  origin: TripLocation,
  destination: TripLocation,
  graph: TransitNetworkGraph,
  bestCandidate: RouteCandidateResult,
) {
  const routeId = [
    config.id,
    bestCandidate.access.stationId,
    bestCandidate.transitPath.transitSegments
      .map((segment) => `${segment.routeId}-${segment.fromStationId}-${segment.toStationId}`)
      .join("__"),
    bestCandidate.egress.stationId,
  ].join("--");
  const originPlace: Place = {
    id: origin.id,
    name: origin.name,
    borough: getBoroughForCoordinates(origin),
    lat: origin.lat,
    lng: origin.lng,
    label: "Origin",
  };
  const destinationPlace: Place = {
    id: destination.id,
    name: destination.name,
    borough: getBoroughForCoordinates(destination),
    lat: destination.lat,
    lng: destination.lng,
    label: "Destination",
  };
  const stationPlaceIds = new Set(
    bestCandidate.transitPath.transitSegments.flatMap((segment) => [
      segment.fromStationId,
      segment.toStationId,
    ]),
  );
  stationPlaceIds.add(bestCandidate.access.stationId);
  stationPlaceIds.add(bestCandidate.egress.stationId);
  const stationPlaces = [...stationPlaceIds]
    .map((stationId) => {
      const station = graph.nodeById.get(stationId);

      if (!station) {
        return null;
      }

      return {
        id: station.id,
        name: station.name,
        borough: getBoroughForCoordinates(station),
        lat: station.lat,
        lng: station.lng,
        label: "Transit hub",
      } satisfies Place;
    })
    .filter((station): station is Place => Boolean(station));
  const transitLegs = await buildTransitPathLegs(routeId, bestCandidate.transitPath, graph);
  const accessLeg: RouteLeg = {
    id: `${routeId}-access`,
    mode: bestCandidate.access.legMode,
    fromPlaceId: originPlace.id,
    toPlaceId: bestCandidate.access.stationId,
    durationMin: bestCandidate.accessDurationMin,
    label:
      bestCandidate.access.legMode === "bus"
        ? "Bus"
        : bestCandidate.access.legMode === "walk"
          ? "Walk"
          : "Ride",
    lineName: bestCandidate.access.lineName,
    details:
      bestCandidate.access.details ??
      `${
        bestCandidate.access.legMode === "bus"
          ? "Take the bus"
          : bestCandidate.access.legMode === "walk"
            ? "Walk"
            : "Ride"
      } to ${bestCandidate.access.stationName}.`,
  };
  const egressLeg: RouteLeg = {
    id: `${routeId}-egress`,
    mode: bestCandidate.egress.legMode,
    fromPlaceId: bestCandidate.egress.stationId,
    toPlaceId: destinationPlace.id,
    durationMin: bestCandidate.egressDurationMin,
    label:
      bestCandidate.egress.legMode === "bus"
        ? "Bus"
        : bestCandidate.egress.legMode === "walk"
          ? "Walk"
          : "Ride",
    lineName: bestCandidate.egress.lineName,
    details:
      bestCandidate.egress.details ??
      `${
        bestCandidate.egress.legMode === "bus"
          ? "Take the bus"
          : bestCandidate.egress.legMode === "walk"
            ? "Walk"
            : "Ride"
      } from ${bestCandidate.egress.stationName} to the destination.`,
  };
  const legs = [accessLeg, ...transitLegs, egressLeg];
  const walkMin = legs.reduce(
    (total, leg) => total + (leg.mode === "walk" ? leg.durationMin : 0),
    0,
  );
  const micromobilityMin = legs.reduce(
    (total, leg) =>
      total +
      (leg.mode === "personal_micromobility" || leg.mode === "shared_micromobility"
        ? leg.durationMin
        : 0),
    0,
  );
  const isTransitOnly = config.micromobilityMode === "avoid";
  const route = {
    id: routeId,
    name:
      config.micromobilityMode === "avoid" &&
      (bestCandidate.access.legMode === "bus" || bestCandidate.egress.legMode === "bus")
        ? "Transit + Bus"
        : config.name,
    micromobilityMode: config.micromobilityMode,
    isTransitOnly,
    bestFor: config.bestFor,
    unlock: config.unlock,
    parking: bestCandidate.parkingText ?? config.parking,
    availability: bestCandidate.availabilityText ?? config.availability,
    comfort: config.comfort,
    metrics: {
      totalMin: 0,
      walkMin,
      micromobilityMin,
      transfers: bestCandidate.transitPath.transferCount,
      costUsd: 0,
      confidence: Math.max(
        0.62,
        0.94 -
          bestCandidate.transitPath.transferCount * 0.08 -
          (config.micromobilityMode === "shared" ? 0.08 : 0) -
          bestCandidate.confidencePenalty,
      ),
    },
    legs,
  } satisfies RouteTemplate;
  const metrics = {
    totalMin: bestCandidate.totalMin,
    walkMin,
    micromobilityMin,
    transfers: bestCandidate.transitPath.transferCount,
    costUsd: Number(costForRoute(route, 3, bestCandidate.sharedRideMin).toFixed(2)),
    confidence: route.metrics.confidence,
  };
  route.metrics = metrics;

  return {
    route,
    placeList: [originPlace, destinationPlace, ...stationPlaces],
  };
}

function createLocationPlace(
  id: string,
  name: string,
  location: CoordinatePoint,
  label: string,
): Place {
  return {
    id,
    name,
    borough: getBoroughForCoordinates(location),
    lat: location.lat,
    lng: location.lng,
    label,
  };
}

async function buildDirectRouteCandidates(
  config: RouteModeConfig,
  origin: TripLocation,
  destination: TripLocation,
  durationCache: Map<string, Promise<number>>,
  supportCaches: SupportCaches,
  tripMode: PlannerPreferences["tripMode"],
) {
  const originPlace = createLocationPlace(origin.id, origin.name, origin, "Origin");
  const destinationPlace = createLocationPlace(
    destination.id,
    destination.name,
    destination,
    "Destination",
  );
  const routeId = `${config.id}--${origin.id}--${destination.id}`;

  if (config.id === "direct-walk") {
    const walkLimit =
      tripMode === "bike_walk" ? MAX_DIRECT_WALK_MIN_BIKE_WALK : MAX_DIRECT_WALK_MIN;
    const directWalkMin = await getRouteDurationMin(
      "walking",
      origin,
      destination,
      durationCache,
    );

    if (directWalkMin > walkLimit) {
      return [];
    }

    return [
      {
        route: {
          id: routeId,
          name: config.name,
          micromobilityMode: config.micromobilityMode,
          isTransitOnly: false,
          bestFor: config.bestFor,
          unlock: config.unlock,
          parking: config.parking,
          availability: config.availability,
          comfort: config.comfort,
          metrics: {
            totalMin: directWalkMin,
            walkMin: directWalkMin,
            micromobilityMin: 0,
            transfers: 0,
            costUsd: 0,
            confidence: 0.98,
          },
          legs: [
            {
              id: `${routeId}-walk`,
              mode: "walk",
              fromPlaceId: originPlace.id,
              toPlaceId: destinationPlace.id,
              durationMin: directWalkMin,
              label: "Walk",
              details: "Walk directly to your destination.",
            },
          ],
        } satisfies RouteTemplate,
        placeList: [originPlace, destinationPlace],
      },
    ];
  }

  if (config.id === "direct-personal") {
    const directRideMin = await getRouteDurationMin(
      "cycling",
      origin,
      destination,
      durationCache,
    );

    if (directRideMin > MAX_DIRECT_RIDE_MIN) {
      return [];
    }

    const parkingSpots = await getCachedParkingSpots(
      supportCaches,
      destination.lat,
      destination.lng,
      "destination",
    );
    const parkingSpot = parkingSpots[0];
    const totalMin = directRideMin + (parkingSpot ? PARKING_BUFFER_MIN : 0);

    return [
      {
        route: {
          id: routeId,
          name: config.name,
          micromobilityMode: config.micromobilityMode,
          isTransitOnly: false,
          bestFor: config.bestFor,
          unlock: config.unlock,
          parking: parkingSpot
            ? `Park near your destination at ${parkingSpot.name}.`
            : "Bring your bike or scooter inside, or park near your destination.",
          availability: config.availability,
          comfort: config.comfort,
          metrics: {
            totalMin,
            walkMin: 0,
            micromobilityMin: directRideMin,
            transfers: 0,
            costUsd: 0,
            confidence: parkingSpot ? 0.96 : 0.9,
          },
          legs: [
            {
              id: `${routeId}-ride`,
              mode: "personal_micromobility",
              fromPlaceId: originPlace.id,
              toPlaceId: destinationPlace.id,
              durationMin: directRideMin,
              label: "Ride",
              details: "Ride directly to your destination.",
            },
          ],
        } satisfies RouteTemplate,
        placeList: [originPlace, destinationPlace],
      },
    ];
  }

  if (config.id === "direct-shared") {
    const sharedLimit =
      tripMode === "bike_walk"
        ? MAX_DIRECT_SHARED_TOTAL_MIN_BIKE_WALK
        : MAX_DIRECT_SHARED_TOTAL_MIN;
    const [pickupStations, dropoffStations] = await Promise.all([
      getCachedSharedStations(supportCaches, origin.lat, origin.lng, "pickup"),
      getCachedSharedStations(supportCaches, destination.lat, destination.lng, "dropoff"),
    ]);

    const directSharedCandidates = await Promise.all(
      pickupStations.flatMap((pickup) =>
        dropoffStations.map(async (dropoff) => {
          const [walkToPickupMin, rideToDockMin, walkToDestinationMin] =
            await Promise.all([
              getRouteDurationMin("walking", origin, pickup, durationCache),
              getRouteDurationMin("cycling", pickup, dropoff, durationCache),
              getRouteDurationMin("walking", dropoff, destination, durationCache),
            ]);

          return {
            pickup,
            dropoff,
            walkToPickupMin,
            rideToDockMin,
            walkToDestinationMin,
            totalMin: walkToPickupMin + rideToDockMin + walkToDestinationMin,
          };
        }),
      ),
    );

    const bestSharedCandidate = directSharedCandidates
      .filter((candidate) => candidate.totalMin <= sharedLimit)
      .sort((left, right) => left.totalMin - right.totalMin)[0];

    if (!bestSharedCandidate) {
      return [];
    }

    const pickupPlace = createLocationPlace(
      `${routeId}-pickup-${bestSharedCandidate.pickup.id}`,
      bestSharedCandidate.pickup.name,
      bestSharedCandidate.pickup,
      "Citi Bike pickup",
    );
    const dropoffPlace = createLocationPlace(
      `${routeId}-dropoff-${bestSharedCandidate.dropoff.id}`,
      bestSharedCandidate.dropoff.name,
      bestSharedCandidate.dropoff,
      "Citi Bike return",
    );

    return [
      {
        route: {
          id: routeId,
          name: config.name,
          micromobilityMode: config.micromobilityMode,
          isTransitOnly: false,
          bestFor: config.bestFor,
          unlock: config.unlock,
          parking: `Pick up at ${bestSharedCandidate.pickup.name} and return at ${bestSharedCandidate.dropoff.name}.`,
          availability: `${bestSharedCandidate.pickup.bikesAvailable} bikes available at pickup, ${bestSharedCandidate.dropoff.docksAvailable} docks open at return.`,
          comfort: config.comfort,
          metrics: {
            totalMin: bestSharedCandidate.totalMin,
            walkMin:
              bestSharedCandidate.walkToPickupMin +
              bestSharedCandidate.walkToDestinationMin,
            micromobilityMin: bestSharedCandidate.rideToDockMin,
            transfers: 0,
            costUsd: Number(
              getCitiBikeSingleRideCost(bestSharedCandidate.rideToDockMin).toFixed(2),
            ),
            confidence:
              0.89 -
              (bestSharedCandidate.pickup.bikesAvailable <= 2 ? 0.05 : 0) -
              (bestSharedCandidate.dropoff.docksAvailable <= 2 ? 0.05 : 0),
          },
          legs: [
            {
              id: `${routeId}-walk-to-pickup`,
              mode: "walk",
              fromPlaceId: originPlace.id,
              toPlaceId: pickupPlace.id,
              durationMin: bestSharedCandidate.walkToPickupMin,
              label: "Walk",
              details: `Walk to Citi Bike pickup at ${bestSharedCandidate.pickup.name}.`,
            },
            {
              id: `${routeId}-shared-ride`,
              mode: "shared_micromobility",
              fromPlaceId: pickupPlace.id,
              toPlaceId: dropoffPlace.id,
              durationMin: bestSharedCandidate.rideToDockMin,
              label: "Ride",
              details: `Ride Citi Bike from ${bestSharedCandidate.pickup.name} to ${bestSharedCandidate.dropoff.name}.`,
            },
            {
              id: `${routeId}-walk-from-dock`,
              mode: "walk",
              fromPlaceId: dropoffPlace.id,
              toPlaceId: destinationPlace.id,
              durationMin: bestSharedCandidate.walkToDestinationMin,
              label: "Walk",
              details: `Walk from ${bestSharedCandidate.dropoff.name} to your destination.`,
            },
          ],
        } satisfies RouteTemplate,
        placeList: [originPlace, pickupPlace, dropoffPlace, destinationPlace],
      },
    ];
  }

  return [];
}

async function buildRouteCandidates(
  config: RouteModeConfig,
  origin: TripLocation,
  destination: TripLocation,
  graph: TransitNetworkGraph,
  durationCache: Map<string, Promise<number>>,
  supportCaches: SupportCaches,
) {
  const [originStations, destinationStations] = await Promise.all([
    getStationCandidates(origin, config.accessMode, "origin", graph, durationCache),
    getStationCandidates(destination, config.egressMode, "destination", graph, durationCache),
  ]);
  const candidates: RouteCandidateResult[] = [];

  for (const accessStation of originStations) {
    for (const egressStation of destinationStations) {
      const transitPath = searchTransitPath(accessStation.stationId, egressStation.stationId, graph);

      if (!transitPath || transitPath.transitSegments.length === 0) {
        continue;
      }

      if (config.id === "personal-both-sides" && config.micromobilityMode === "personal") {
        // Keep the carry-through option simple and practical for demo quality.
        if (transitPath.transferCount > 0) {
          continue;
        }
      }

      const supportContext = await getRouteSupportContext(
        config,
        origin,
        destination,
        accessStation,
        egressStation,
        supportCaches,
        durationCache,
      );

      if (!supportContext) {
        continue;
      }

      candidates.push({
        totalMin:
          supportContext.accessDurationMin +
          transitPath.transitTravelMin +
          transitPath.transferWalkMin +
          supportContext.egressDurationMin,
        access: accessStation,
        egress: egressStation,
        transitPath,
        accessDurationMin: supportContext.accessDurationMin,
        egressDurationMin: supportContext.egressDurationMin,
        sharedRideMin: supportContext.sharedRideMin,
        availabilityText: supportContext.availabilityText,
        parkingText: supportContext.parkingText,
        confidencePenalty: supportContext.confidencePenalty,
      });
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  const distinctCandidates = candidates
    .sort((left, right) => left.totalMin - right.totalMin)
    .filter((candidate, index, allCandidates) => {
      const signature = candidate.transitPath.transitSegments
        .map(
          (segment) =>
            `${segment.routeId}:${segment.fromStationId}:${segment.toStationId}`,
        )
        .join("__");

      return (
        allCandidates.findIndex((entry) => {
          const entrySignature = entry.transitPath.transitSegments
            .map(
              (segment) =>
                `${segment.routeId}:${segment.fromStationId}:${segment.toStationId}`,
            )
            .join("__");

          return entrySignature === signature;
        }) === index
      );
    })
    .slice(0, MAX_ROUTE_VARIANTS_PER_MODE);

  return Promise.all(
    distinctCandidates.map((candidate) =>
      materializeRouteCandidate(config, origin, destination, graph, candidate),
    ),
  );
}

function rankRoutes(routes: RouteTemplate[], preferences: PlannerPreferences) {
  const transitOnlyRoute = routes.find((route) => route.isTransitOnly) ?? routes[0];

  return routes
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
    })) satisfies RouteResult[];
}

export async function buildComputedPlannerPlan(
  origin: TripLocation,
  destination: TripLocation,
  preferences: PlannerPreferences,
): Promise<PlannerPlan> {
  const durationCache = new Map<string, Promise<number>>();
  const supportCaches: SupportCaches = {
    sharedStationCache: new Map(),
    parkingCache: new Map(),
  };
  const routeConfigs = buildRouteConfigs().filter((config) => {
    if (preferences.tripMode === "fastest") {
      return config.micromobilityMode !== "shared";
    }

    if (preferences.tripMode === "mixed") {
      return config.kind === "transit" && config.micromobilityMode === "personal";
    }

    if (preferences.tripMode === "transit") {
      return config.kind === "transit" && config.micromobilityMode === "avoid";
    }

    if (preferences.tripMode === "bike_walk") {
      return config.kind === "direct";
    }

    return false;
  });
  const needsTransitGraph = routeConfigs.some((config) => config.kind === "transit");
  const graph = needsTransitGraph
    ? await getTransitNetworkGraph(origin, destination)
    : undefined;
  const builtRoutes = await Promise.all(
    routeConfigs.map((config) =>
      config.kind === "direct"
        ? buildDirectRouteCandidates(
            config,
            origin,
            destination,
            durationCache,
            supportCaches,
            preferences.tripMode,
          )
        : buildRouteCandidates(
            config,
            origin,
            destination,
            graph!,
            durationCache,
            supportCaches,
          ),
    ),
  );
  const validRoutes = builtRoutes.flat().filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry),
  );

  if (validRoutes.length === 0) {
    if (!graph) {
      throw new Error("No bike or walk route is available for this trip yet.");
    }

    const [originDebugStations, destinationDebugStations] = await Promise.all([
      getStationCandidates(origin, "walk", "origin", graph, durationCache),
      getStationCandidates(destination, "walk", "destination", graph, durationCache),
    ]);
    throw new Error(
      `Unable to find a supported subway path for this trip yet. Origin candidates: ${originDebugStations
        .map((station) => `${station.stationId}:${station.durationMin}`)
        .join(", ")}. Destination candidates: ${destinationDebugStations
        .map((station) => `${station.stationId}:${station.durationMin}`)
        .join(", ")}.`,
    );
  }

  const routeByPlaceId = new Map<string, Place>();

  for (const { placeList } of validRoutes) {
    for (const place of placeList) {
      routeByPlaceId.set(place.id, place);
    }
  }

  const rankedRoutes = rankRoutes(
    validRoutes.map((entry) => entry.route),
    preferences,
  );
  const transitOnlyRoute =
    rankedRoutes.find((route) => route.isTransitOnly) ?? rankedRoutes[0];

  return {
    scenario: resolveScenarioForLocations(origin, destination).scenario,
    recommendedRoute: rankedRoutes[0],
    transitOnlyRoute,
    rankedRoutes,
    placeList: Array.from(routeByPlaceId.values()),
    selectedOrigin: origin,
    selectedDestination: destination,
    resolvedByNearestScenario: false,
  };
}
