export interface RouteSurfaceLegGeometry {
  legId: string;
  profile: "walking" | "cycling" | "driving";
  coordinates: Array<[number, number]>;
  durationMin: number;
}

export interface PlannerRouteSurfaceGeometry {
  routeId: string;
  fetchedAt: string;
  legs: RouteSurfaceLegGeometry[];
}
