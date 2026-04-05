import "server-only";

import { scenarios } from "@/lib/fasttrack-data";
import { transitLegOverrides } from "@/lib/mta/leg-overrides";
import { getTransitLegIntel } from "@/lib/mta/subway-realtime";
import { PlannerRouteIntel } from "@/lib/mta/types";

export async function getPlannerRouteIntel(routeId: string): Promise<PlannerRouteIntel> {
  const route = scenarios.flatMap((scenario) => scenario.routes).find((entry) => entry.id === routeId);

  if (!route) {
    throw new Error(`Unknown planner route: ${routeId}`);
  }

  const transitLegs = route.legs.filter((leg) => leg.mode === "transit");
  const resolvedLegs = await Promise.all(
    transitLegs.map(async (leg) => {
      const override = transitLegOverrides[leg.id];
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
    routeId,
    fetchedAt: new Date().toISOString(),
    transitLegs: resolvedLegs,
  };
}
