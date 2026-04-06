import type { Place, PlannerPreferences, RouteTemplate } from "@/lib/fasttrack-data";
import type { PlannerPlan, TripLocation } from "@/lib/fasttrack-routing";

export interface PlannerPlanRequest {
  origin: TripLocation;
  destination: TripLocation;
  preferences: PlannerPreferences;
}

export interface PlannerRouteRequest {
  route: RouteTemplate;
  placeList: Place[];
}

export type PlannerPlanResponse = PlannerPlan;
