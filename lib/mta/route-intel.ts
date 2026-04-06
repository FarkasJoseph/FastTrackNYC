import "server-only";

import { scenarios, type RouteTemplate } from "@/lib/fasttrack-data";
import { getMtaDemoReferenceDate } from "@/lib/mta/demo-time";
import { transitLegOverrides } from "@/lib/mta/leg-overrides";
import { getTransitLegIntel } from "@/lib/mta/subway-realtime";
import { PlannerRouteIntel } from "@/lib/mta/types";

export async function getRouteIntelForRoute(route: RouteTemplate): Promise<PlannerRouteIntel> {
  const transitLegs = route.legs.filter((leg) => leg.mode === "transit");
  const resolvedLegs = await Promise.all(
    transitLegs.map(async (leg) => {
      const override = leg.mta
        ? {
            fromStopId: leg.mta.originStopId.replace(/[NS]$/, ""),
            toStopId: leg.mta.destinationStopId.replace(/[NS]$/, ""),
            routeIds: leg.mta.routeIds,
            shapeId: leg.mta.shapeId,
          }
        : transitLegOverrides[leg.id];
      const legIndex = route.legs.findIndex((candidate) => candidate.id === leg.id);
      const accessLeadMinutes =
        legIndex > 0
          ? route.legs
              .slice(0, legIndex)
              .reduce((total, candidate) => total + candidate.durationMin, 0)
          : 0;

      if (!override) {
        return {
          legId: leg.id,
          status: "unsupported" as const,
          reason: "Live MTA data is only wired for routes with direct subway mappings.",
          lines: [],
          departures: [],
          alerts: [],
        };
      }

      return getTransitLegIntel(leg.id, override, accessLeadMinutes);
    }),
  );

  return {
    routeId: route.id,
    fetchedAt: getMtaDemoReferenceDate().toISOString(),
    transitLegs: resolvedLegs,
  };
}

export async function getPlannerRouteIntel(routeId: string): Promise<PlannerRouteIntel> {
  const route = scenarios
    .flatMap((scenario) => scenario.routes)
    .find((entry) => entry.id === routeId);

  if (!route) {
    throw new Error(`Unknown planner route: ${routeId}`);
  }

  return getRouteIntelForRoute(route);
}
