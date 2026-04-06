import "server-only";

import { places, type Place } from "@/lib/fasttrack-data";
import type { TripLocation } from "@/lib/fasttrack-routing";
import {
  getBusFeedKeysForBoroughs,
  getBusSearchGraph,
  type BusFeedKey,
  type BusSearchGraph,
} from "@/lib/mta/bus-static";
import {
  getTransitSearchGraph as getSubwaySearchGraph,
  type TransitSearchBoardOption,
  type TransitSearchEdge,
  type TransitSearchTransferEdge,
} from "@/lib/mta/subway-static";
import type { MtaStationSummary } from "@/lib/mta/types";

export type NetworkMode = "transit" | "bus";

export type TransitNetworkNode = MtaStationSummary & {
  kind: "subway_station" | "bus_stop";
  feedKey?: BusFeedKey;
};

export type TransitNetworkEdge = {
  mode: NetworkMode;
  routeId: string;
  routeShortName: string;
  routeLongName?: string;
  fromNodeId: string;
  toNodeId: string;
  travelSeconds: number;
  headsign: string;
  directionId: number | null;
  shapeId?: string;
  feedKey?: BusFeedKey;
};

export type TransitNetworkBoardOption = {
  mode: NetworkMode;
  routeId: string;
  routeShortName: string;
  routeLongName?: string;
  directionId: number | null;
  feedKey?: BusFeedKey;
};

export type TransitNetworkTransferEdge = TransitSearchTransferEdge;

export type TransitNetworkGraph = {
  nodes: TransitNetworkNode[];
  nodeById: Map<string, TransitNetworkNode>;
  edgesByNodeId: Map<string, TransitNetworkEdge[]>;
  boardOptionsByNodeId: Map<string, TransitNetworkBoardOption[]>;
  transferEdgesByNodeId: Map<string, TransitNetworkTransferEdge[]>;
};

const BUS_TO_SUBWAY_TRANSFER_RADIUS_METERS = 280;
const BUS_TO_BUS_TRANSFER_RADIUS_METERS = 120;
const MAX_BUS_TO_SUBWAY_TRANSFERS = 3;
const MAX_BUS_TO_BUS_TRANSFERS = 2;
const MAX_SUBWAY_ONLY_ACCESS_METERS = 1_200;
const LAGUARDIA_COORDINATES = { lat: 40.7769, lng: -73.874 };
const LAGUARDIA_BUS_RADIUS_METERS = 2_500;
const transitNetworkCache = new Map<string, Promise<TransitNetworkGraph>>();

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: Pick<TripLocation | TransitNetworkNode | Place, "lat" | "lng">,
  to: Pick<TripLocation | TransitNetworkNode | Place, "lat" | "lng">,
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

function nearestSubwayDistanceMeters(
  location: Pick<TripLocation, "lat" | "lng">,
  subwayStations: MtaStationSummary[],
) {
  return subwayStations.reduce((bestDistance, station) => {
    const distance = distanceMeters(location, station);
    return Math.min(bestDistance, distance);
  }, Number.POSITIVE_INFINITY);
}

function shouldIncludeBusNetwork(
  origin: TripLocation,
  destination: TripLocation,
  subwayStations: MtaStationSummary[],
) {
  if (
    distanceMeters(origin, LAGUARDIA_COORDINATES) <= LAGUARDIA_BUS_RADIUS_METERS ||
    distanceMeters(destination, LAGUARDIA_COORDINATES) <= LAGUARDIA_BUS_RADIUS_METERS
  ) {
    return true;
  }

  return (
    nearestSubwayDistanceMeters(origin, subwayStations) > MAX_SUBWAY_ONLY_ACCESS_METERS ||
    nearestSubwayDistanceMeters(destination, subwayStations) > MAX_SUBWAY_ONLY_ACCESS_METERS
  );
}

function getBoroughForCoordinates(location: Pick<TripLocation | Place, "lat" | "lng">) {
  return [...places].sort(
    (left, right) => distanceMeters(location, left) - distanceMeters(location, right),
  )[0]?.borough ?? "Manhattan";
}

function walkingTransferSeconds(distance: number) {
  return Math.max(60, Math.round((distance / 80) * 60));
}

function getGridKey(lat: number, lng: number, gridSizeDegrees: number) {
  return `${Math.floor(lat / gridSizeDegrees)}:${Math.floor(lng / gridSizeDegrees)}`;
}

function pushTransferEdge(
  transferEdgesByNodeId: Map<string, TransitNetworkTransferEdge[]>,
  edge: TransitNetworkTransferEdge,
) {
  const current = transferEdgesByNodeId.get(edge.fromStationId) ?? [];

  if (!current.some((candidate) => candidate.toStationId === edge.toStationId)) {
    current.push(edge);
    transferEdgesByNodeId.set(edge.fromStationId, current);
  }
}

export async function getTransitNetworkGraph(
  origin: TripLocation,
  destination: TripLocation,
): Promise<TransitNetworkGraph> {
  const subwayGraph = await getSubwaySearchGraph();
  const feedKeys = getBusFeedKeysForBoroughs([
    getBoroughForCoordinates(origin),
    getBoroughForCoordinates(destination),
  ]);
  const includeBus = shouldIncludeBusNetwork(origin, destination, subwayGraph.stations);
  const cacheKey = includeBus
    ? `bus:${feedKeys.slice().sort().join("|")}`
    : "subway-only";
  const cached =
    transitNetworkCache.get(cacheKey) ??
    (async () => {
      const busGraph: BusSearchGraph = includeBus
        ? await getBusSearchGraph(feedKeys)
        : {
            stops: [],
            stopById: new Map(),
            edgesByStopId: new Map(),
            boardOptionsByStopId: new Map(),
          };

      const nodeById = new Map<string, TransitNetworkNode>();

      for (const station of subwayGraph.stations) {
        nodeById.set(station.id, {
          ...station,
          kind: "subway_station",
        });
      }

      for (const stop of busGraph.stops) {
        nodeById.set(stop.id, {
          ...stop,
          kind: "bus_stop",
          feedKey: stop.feedKey,
        });
      }

      const edgesByNodeId = new Map<string, TransitNetworkEdge[]>();

      for (const [stationId, edges] of subwayGraph.edgesByStationId.entries()) {
        edgesByNodeId.set(
          stationId,
          edges.map((edge: TransitSearchEdge) => ({
            mode: "transit",
            routeId: edge.routeId,
            routeShortName: edge.routeId,
            fromNodeId: edge.fromStationId,
            toNodeId: edge.toStationId,
            travelSeconds: edge.travelSeconds,
            headsign: edge.headsign,
            directionId: edge.directionId,
            shapeId: edge.shapeId,
          })),
        );
      }

      for (const [stopId, edges] of busGraph.edgesByStopId.entries()) {
        const current = edgesByNodeId.get(stopId) ?? [];
        current.push(
          ...edges.map((edge) => ({
            mode: "bus" as const,
            routeId: edge.routeId,
            routeShortName: edge.routeShortName,
            routeLongName: edge.routeLongName,
            fromNodeId: edge.fromStopId,
            toNodeId: edge.toStopId,
            travelSeconds: edge.travelSeconds,
            headsign: edge.headsign,
            directionId: edge.directionId,
            shapeId: edge.shapeId,
            feedKey: edge.feedKey,
          })),
        );
        edgesByNodeId.set(stopId, current);
      }

      const boardOptionsByNodeId = new Map<string, TransitNetworkBoardOption[]>();

      for (const [stationId, boardOptions] of subwayGraph.boardOptionsByStationId.entries()) {
        boardOptionsByNodeId.set(
          stationId,
          boardOptions.map((option: TransitSearchBoardOption) => ({
            mode: "transit",
            routeId: option.routeId,
            routeShortName: option.routeId,
            directionId: option.directionId,
          })),
        );
      }

      for (const [stopId, boardOptions] of busGraph.boardOptionsByStopId.entries()) {
        const current = boardOptionsByNodeId.get(stopId) ?? [];
        current.push(
          ...boardOptions.map((option) => ({
            mode: "bus" as const,
            routeId: option.routeId,
            routeShortName: option.routeShortName,
            routeLongName: option.routeLongName,
            directionId: option.directionId,
            feedKey: option.feedKey,
          })),
        );
        boardOptionsByNodeId.set(stopId, current);
      }

      const transferEdgesByNodeId = new Map<string, TransitNetworkTransferEdge[]>();

      for (const [stationId, transferEdges] of subwayGraph.transferEdgesByStationId.entries()) {
        transferEdgesByNodeId.set(stationId, [...transferEdges]);
      }

      const busStops = busGraph.stops.map((stop) => nodeById.get(stop.id)!);
      const subwayStations = subwayGraph.stations.map((station) => nodeById.get(station.id)!);
      const gridSizeDegrees = 0.003;
      const busGrid = new Map<string, TransitNetworkNode[]>();

      for (const busStop of busStops) {
        const key = getGridKey(busStop.lat, busStop.lng, gridSizeDegrees);
        const current = busGrid.get(key) ?? [];
        current.push(busStop);
        busGrid.set(key, current);
      }

      for (const subwayStation of subwayStations) {
        const subwayKey = getGridKey(subwayStation.lat, subwayStation.lng, gridSizeDegrees);
        const [subwayLatKey, subwayLngKey] = subwayKey.split(":").map(Number);
        const nearbyBusStops: Array<{ stop: TransitNetworkNode; distance: number }> = [];

        for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
          for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
            const bucket = busGrid.get(`${subwayLatKey + latOffset}:${subwayLngKey + lngOffset}`) ?? [];

            for (const busStop of bucket) {
              const distance = distanceMeters(subwayStation, busStop);

              if (distance <= BUS_TO_SUBWAY_TRANSFER_RADIUS_METERS) {
                nearbyBusStops.push({ stop: busStop, distance });
              }
            }
          }
        }

        nearbyBusStops
          .sort((left, right) => left.distance - right.distance)
          .slice(0, MAX_BUS_TO_SUBWAY_TRANSFERS)
          .forEach(({ stop, distance }) => {
            const transferSeconds = walkingTransferSeconds(distance);
            pushTransferEdge(transferEdgesByNodeId, {
              fromStationId: subwayStation.id,
              toStationId: stop.id,
              transferSeconds,
            });
            pushTransferEdge(transferEdgesByNodeId, {
              fromStationId: stop.id,
              toStationId: subwayStation.id,
              transferSeconds,
            });
          });
      }

      for (const busStop of busStops) {
        const gridKey = getGridKey(busStop.lat, busStop.lng, gridSizeDegrees);
        const [latKey, lngKey] = gridKey.split(":").map(Number);
        const nearbyStops: Array<{ stop: TransitNetworkNode; distance: number }> = [];

        for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
          for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
            const bucket = busGrid.get(`${latKey + latOffset}:${lngKey + lngOffset}`) ?? [];

            for (const nearbyStop of bucket) {
              if (nearbyStop.id === busStop.id) {
                continue;
              }

              const distance = distanceMeters(busStop, nearbyStop);

              if (distance <= BUS_TO_BUS_TRANSFER_RADIUS_METERS) {
                nearbyStops.push({ stop: nearbyStop, distance });
              }
            }
          }
        }

        nearbyStops
          .sort((left, right) => left.distance - right.distance)
          .slice(0, MAX_BUS_TO_BUS_TRANSFERS)
          .forEach(({ stop, distance }) => {
            pushTransferEdge(transferEdgesByNodeId, {
              fromStationId: busStop.id,
              toStationId: stop.id,
              transferSeconds: walkingTransferSeconds(distance),
            });
          });
      }

      return {
        nodes: [...nodeById.values()],
        nodeById,
        edgesByNodeId,
        boardOptionsByNodeId,
        transferEdgesByNodeId,
      };
    })();

  if (!transitNetworkCache.has(cacheKey)) {
    transitNetworkCache.set(cacheKey, cached);
  }

  return cached;
}
