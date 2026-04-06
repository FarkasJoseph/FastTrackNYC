export interface TransitLegOverride {
  fromStopId: string;
  toStopId: string;
  routeIds: string[];
  shapeId?: string;
}

export const transitLegOverrides: Record<string, TransitLegOverride> = {
  "harlem-subway-1": {
    fromStopId: "621",
    toStopId: "631",
    routeIds: ["6"],
  },
  "harlem-subway-2": {
    fromStopId: "621",
    toStopId: "631",
    routeIds: ["4", "5"],
  },
  "harlem-subway-3": {
    fromStopId: "621",
    toStopId: "631",
    routeIds: ["4", "5"],
  },
  "harlem-subway-4": {
    fromStopId: "621",
    toStopId: "631",
    routeIds: ["4", "5"],
  },
  "harlem-subway-5": {
    fromStopId: "621",
    toStopId: "631",
    routeIds: ["4", "5"],
  },
  "harlem-subway-6": {
    fromStopId: "621",
    toStopId: "631",
    routeIds: ["4", "5"],
  },
  "williamsburg-subway-1": {
    fromStopId: "M16",
    toStopId: "M23",
    routeIds: ["J"],
  },
  "williamsburg-subway-2": {
    fromStopId: "M16",
    toStopId: "M23",
    routeIds: ["J", "Z"],
  },
  "williamsburg-subway-3": {
    fromStopId: "M16",
    toStopId: "M23",
    routeIds: ["J", "Z"],
  },
  "williamsburg-subway-4": {
    fromStopId: "M16",
    toStopId: "M23",
    routeIds: ["J", "Z"],
  },
  "williamsburg-subway-5": {
    fromStopId: "M16",
    toStopId: "M23",
    routeIds: ["J", "Z"],
  },
  "williamsburg-subway-6": {
    fromStopId: "M16",
    toStopId: "M23",
    routeIds: ["J", "Z"],
  },
  "astoria-subway-1": {
    fromStopId: "R01",
    toStopId: "R16",
    routeIds: ["N", "W"],
  },
  "astoria-subway-2": {
    fromStopId: "R09",
    toStopId: "R16",
    routeIds: ["N", "W"],
  },
  "astoria-subway-3": {
    fromStopId: "R09",
    toStopId: "R16",
    routeIds: ["N", "W"],
  },
  "astoria-subway-4": {
    fromStopId: "R01",
    toStopId: "R16",
    routeIds: ["N", "W"],
  },
  "astoria-subway-5": {
    fromStopId: "R01",
    toStopId: "R16",
    routeIds: ["N", "W"],
  },
  "astoria-subway-6": {
    fromStopId: "R09",
    toStopId: "R16",
    routeIds: ["N", "W"],
  },
  "sunset-subway-2": {
    fromStopId: "235",
    toStopId: "419",
    routeIds: ["4", "5"],
  },
  "sunset-subway-1": {
    fromStopId: "R39",
    toStopId: "R27",
    routeIds: ["R"],
  },
  "sunset-subway-3": {
    fromStopId: "235",
    toStopId: "419",
    routeIds: ["4", "5"],
  },
  "sunset-subway-4": {
    fromStopId: "235",
    toStopId: "419",
    routeIds: ["4", "5"],
  },
  "sunset-subway-5": {
    fromStopId: "235",
    toStopId: "419",
    routeIds: ["4", "5"],
  },
  "sunset-subway-6": {
    fromStopId: "235",
    toStopId: "419",
    routeIds: ["4", "5"],
  },
  "lic-subway-1": {
    fromStopId: "R09",
    toStopId: "R19",
    routeIds: ["N", "W"],
  },
  "lic-subway-2": {
    fromStopId: "R09",
    toStopId: "R19",
    routeIds: ["N", "W"],
  },
  "lic-subway-3": {
    fromStopId: "R09",
    toStopId: "R19",
    routeIds: ["N", "W"],
  },
  "lic-subway-4": {
    fromStopId: "R09",
    toStopId: "R19",
    routeIds: ["N", "W"],
  },
  "lic-subway-5": {
    fromStopId: "R09",
    toStopId: "R19",
    routeIds: ["N", "W"],
  },
  "lic-subway-6": {
    fromStopId: "R09",
    toStopId: "R19",
    routeIds: ["N", "W"],
  },
};
