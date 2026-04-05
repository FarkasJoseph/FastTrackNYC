export interface MtaLine {
  id: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
}

export interface MtaStationSummary {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface MtaDeparture {
  tripId: string;
  routeId: string;
  headsign: string;
  departureAt: string;
  departureInMin: number;
  arrivalAt?: string;
  travelMin?: number;
}

export interface MtaAlertSummary {
  id: string;
  header: string;
  description: string;
  type: string;
  updatedAt?: string;
}

export interface MtaGeometry {
  source: "realtime" | "schedule";
  coordinates: Array<[number, number]>;
  fullCoordinates?: Array<[number, number]>;
}

export interface MtaTransitLegIntel {
  legId: string;
  status: "ok" | "unsupported" | "unavailable";
  reason?: string;
  lines: MtaLine[];
  fromStation?: MtaStationSummary;
  toStation?: MtaStationSummary;
  headsign?: string;
  departureInMin?: number;
  travelMin?: number;
  departures: MtaDeparture[];
  alerts: MtaAlertSummary[];
  geometry?: MtaGeometry;
}

export interface PlannerRouteIntel {
  routeId: string;
  fetchedAt: string;
  transitLegs: MtaTransitLegIntel[];
}
