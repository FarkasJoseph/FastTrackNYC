import type { TripLocation } from "@/lib/fasttrack-routing";

export type BusConnectorCandidate = {
  stationId: string;
  routeId: string;
  routeLabel: string;
  durationMin: number;
  details: string;
};

const LAGUARDIA_CENTER = {
  lat: 40.7769,
  lng: -73.874,
};

const LAGUARDIA_RADIUS_METERS = 2_600;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: Pick<TripLocation, "lat" | "lng">,
  to: Pick<TripLocation, "lat" | "lng">,
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

function looksLikeLaGuardia(location: TripLocation) {
  return (
    distanceMeters(location, LAGUARDIA_CENTER) <= LAGUARDIA_RADIUS_METERS ||
    /laguardia|la guardia|lga/i.test(`${location.name} ${location.fullAddress}`)
  );
}

export function getBusConnectorCandidates(
  location: TripLocation,
  role: "origin" | "destination",
) {
  if (!looksLikeLaGuardia(location)) {
    return [] satisfies BusConnectorCandidate[];
  }

  if (role === "origin") {
    return [
      {
        stationId: "G14",
        routeId: "Q70",
        routeLabel: "Q70-SBS",
        durationMin: 18,
        details:
          "Take the free Q70-SBS from LaGuardia to Jackson Hts-Roosevelt Av for a fast subway handoff.",
      },
      {
        stationId: "R03",
        routeId: "M60",
        routeLabel: "M60-SBS",
        durationMin: 14,
        details:
          "Take the M60-SBS from LaGuardia to Astoria Blvd for the quickest N/W handoff.",
      },
      {
        stationId: "621",
        routeId: "M60",
        routeLabel: "M60-SBS",
        durationMin: 28,
        details:
          "Take the M60-SBS from LaGuardia to 125 St-Lexington Av for direct east-side subway access.",
      },
    ] satisfies BusConnectorCandidate[];
  }

  return [
    {
      stationId: "G14",
      routeId: "Q70",
      routeLabel: "Q70-SBS",
      durationMin: 18,
      details:
        "Take the free Q70-SBS from Jackson Hts-Roosevelt Av into LaGuardia.",
    },
    {
      stationId: "R03",
      routeId: "M60",
      routeLabel: "M60-SBS",
      durationMin: 14,
      details:
        "Take the M60-SBS from Astoria Blvd into LaGuardia.",
    },
    {
      stationId: "621",
      routeId: "M60",
      routeLabel: "M60-SBS",
      durationMin: 28,
      details:
        "Take the M60-SBS from 125 St-Lexington Av into LaGuardia.",
    },
  ] satisfies BusConnectorCandidate[];
}
