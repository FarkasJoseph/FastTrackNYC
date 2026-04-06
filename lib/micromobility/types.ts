export type SharedMobilityProvider = "citi-bike";

export type SharedMobilityStationKind = "pickup" | "dropoff";

export interface SharedMobilityStationSuggestion {
  id: string;
  provider: SharedMobilityProvider;
  role: SharedMobilityStationKind;
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  bikesAvailable: number;
  ebikesAvailable: number;
  docksAvailable: number;
  capacity?: number;
}

export interface BikeParkingSuggestion {
  id: string;
  source: "nyc-dot";
  role: "station" | "destination";
  name: string;
  address: string;
  borough: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  rackType: string;
  program: string;
  onStreet?: string;
  fromStreet?: string;
  toStreet?: string;
  sideOfStreet?: string;
  notes?: string;
}

export interface PlannerRouteMobilityContext {
  routeId: string;
  fetchedAt: string;
  sharedStations: SharedMobilityStationSuggestion[];
  parkingSpots: BikeParkingSuggestion[];
}

export type PlannerMicromobilityContext = PlannerRouteMobilityContext;
