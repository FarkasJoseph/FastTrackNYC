export type Borough =
  | "Manhattan"
  | "Brooklyn"
  | "Queens"
  | "Bronx"
  | "Staten Island";

export type TravelMode =
  | "walk"
  | "bus"
  | "transit"
  | "personal_micromobility"
  | "shared_micromobility";

export type PlannerGoal =
  | "fastest"
  | "fewest_transfers"
  | "least_walking"
  | "balance";

export type MicromobilityMode = "any" | "personal" | "shared" | "avoid";
export type PlannerTripMode = "fastest" | "mixed" | "transit" | "bike_walk";
export type MtaDirection = "N" | "S";

export interface Place {
  id: string;
  name: string;
  borough: Borough;
  lat: number;
  lng: number;
  label: string;
}

export interface RouteLeg {
  id: string;
  mode: TravelMode;
  fromPlaceId: string;
  toPlaceId: string;
  durationMin: number;
  label: string;
  lineName?: string;
  details: string;
  mta?: {
    routeIds: string[];
    originStopId: string;
    destinationStopId: string;
    direction: MtaDirection;
    shapeId?: string;
  };
  bus?: {
    routeId: string;
    routeShortName: string;
    originStopId: string;
    destinationStopId: string;
    shapeId: string;
    feedKey: string;
    headsign?: string;
  };
}

export interface RouteMetrics {
  totalMin: number;
  walkMin: number;
  micromobilityMin: number;
  transfers: number;
  costUsd: number;
  confidence: number;
}

export interface RouteTemplate {
  id: string;
  name: string;
  micromobilityMode: MicromobilityMode;
  isTransitOnly: boolean;
  bestFor: string;
  unlock: string;
  parking: string;
  availability: string;
  comfort: string;
  metrics: RouteMetrics;
  legs: RouteLeg[];
}

export interface Scenario {
  id: string;
  title: string;
  headline: string;
  description: string;
  originId: string;
  destinationId: string;
  heroMetric: string;
  routes: RouteTemplate[];
}

export interface PlannerPreferences {
  goal: PlannerGoal;
  tripMode: PlannerTripMode;
}

export const places: Place[] = [
  { id: "harlem", name: "South Harlem", borough: "Manhattan", lat: 40.8044, lng: -73.9557, label: "Origin" },
  { id: "williamsburg", name: "North Williamsburg", borough: "Brooklyn", lat: 40.7187, lng: -73.9571, label: "Origin" },
  { id: "astoria", name: "Astoria-Ditmars", borough: "Queens", lat: 40.775, lng: -73.9122, label: "Origin" },
  { id: "sunset-park", name: "Sunset Park", borough: "Brooklyn", lat: 40.6455, lng: -74.012, label: "Origin" },
  { id: "lic", name: "Long Island City", borough: "Queens", lat: 40.7447, lng: -73.9485, label: "Origin" },
  { id: "midtown-east", name: "Midtown East", borough: "Manhattan", lat: 40.7527, lng: -73.9772, label: "Destination" },
  { id: "midtown-west", name: "Midtown West", borough: "Manhattan", lat: 40.758, lng: -73.9918, label: "Destination" },
  { id: "fidi", name: "Financial District", borough: "Manhattan", lat: 40.7075, lng: -74.0113, label: "Destination" },
  { id: "flatiron", name: "Flatiron", borough: "Manhattan", lat: 40.7411, lng: -73.9897, label: "Destination" },
  { id: "grand-central", name: "Grand Central", borough: "Manhattan", lat: 40.7527, lng: -73.9772, label: "Transit hub" },
  { id: "125-express", name: "125 St Express", borough: "Manhattan", lat: 40.8042, lng: -73.9377, label: "Transit hub" },
  { id: "marcy-ave", name: "Marcy Av", borough: "Brooklyn", lat: 40.7083, lng: -73.9579, label: "Transit hub" },
  { id: "ditmars-blvd", name: "Astoria-Ditmars Blvd", borough: "Queens", lat: 40.775036, lng: -73.912034, label: "Transit hub" },
  { id: "queensboro-plaza", name: "Queensboro Plaza", borough: "Queens", lat: 40.7505, lng: -73.9401, label: "Transit hub" },
  { id: "atlantic-terminal", name: "Atlantic Terminal", borough: "Brooklyn", lat: 40.6845, lng: -73.9776, label: "Transit hub" },
  { id: "court-square", name: "Court Sq-23 St", borough: "Queens", lat: 40.747846, lng: -73.946, label: "Transit hub" },
  { id: "broad-st", name: "Broad St", borough: "Manhattan", lat: 40.706476, lng: -74.011056, label: "Transit hub" },
  { id: "times-sq-broadway", name: "Times Sq-42 St", borough: "Manhattan", lat: 40.754672, lng: -73.986754, label: "Transit hub" },
  { id: "wall-st", name: "Wall St", borough: "Manhattan", lat: 40.707557, lng: -74.011862, label: "Transit hub" },
  { id: "23-r", name: "23 St", borough: "Manhattan", lat: 40.745906, lng: -73.998041, label: "Transit hub" },
  { id: "45-r", name: "45 St", borough: "Brooklyn", lat: 40.648939, lng: -74.010006, label: "Transit hub" },
  { id: "whitehall", name: "Whitehall St-South Ferry", borough: "Manhattan", lat: 40.703087, lng: -74.012994, label: "Transit hub" },
];

export const scenarios: Scenario[] = [
  {
    id: "harlem-to-midtown-east",
    title: "South Harlem to Midtown East",
    headline: "Bike or scooter to a better express stop and skip the crosstown drag.",
    description:
      "A short micromobility leg unlocks the 4/5 at 125 St, cutting out a slower local approach and a transfer-heavy Midtown finish.",
    originId: "harlem",
    destinationId: "midtown-east",
    heroMetric: "Up to 15 min faster than transit-only",
    routes: [
      {
        id: "harlem-baseline",
        name: "Transit-only baseline",
        micromobilityMode: "avoid",
        isTransitOnly: true,
        bestFor: "no riding required",
        unlock: "Uses the same corridor without reaching the faster express pattern",
        parking: "Not needed",
        availability: "Always available",
        comfort: "High",
        metrics: { totalMin: 44, walkMin: 14, micromobilityMin: 0, transfers: 0, costUsd: 3, confidence: 0.86 },
        legs: [
          { id: "harlem-walk-1", mode: "walk", fromPlaceId: "harlem", toPlaceId: "125-express", durationMin: 10, label: "Walk", details: "Reach the nearest reliable station access on foot." },
          { id: "harlem-subway-1", mode: "transit", fromPlaceId: "125-express", toPlaceId: "grand-central", durationMin: 24, label: "Subway", lineName: "6", details: "Local Lexington service into Grand Central, slower than the express alternative.", mta: { routeIds: ["6"], originStopId: "621S", destinationStopId: "631S", direction: "S" } },
          { id: "harlem-walk-2", mode: "walk", fromPlaceId: "grand-central", toPlaceId: "midtown-east", durationMin: 10, label: "Walk", details: "Last stretch through Midtown East." },
        ],
      },
      {
        id: "harlem-personal",
        name: "Personal micromobility + express",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "fastest arrival",
        unlock: "Unlocks the 4/5 express with zero extra transfer friction",
        parking: "High-confidence curbside parking near Grand Central",
        availability: "Bring your own bike or scooter",
        comfort: "Protected and wide avenues for most of the ride",
        metrics: { totalMin: 29, walkMin: 5, micromobilityMin: 7, transfers: 0, costUsd: 3, confidence: 0.92 },
        legs: [
          { id: "harlem-ride-1", mode: "personal_micromobility", fromPlaceId: "harlem", toPlaceId: "125-express", durationMin: 7, label: "Ride", details: "Use your bike or scooter to reach stronger express access fast." },
          { id: "harlem-subway-2", mode: "transit", fromPlaceId: "125-express", toPlaceId: "grand-central", durationMin: 17, label: "Subway", lineName: "4/5", details: "Direct express run into Midtown East.", mta: { routeIds: ["4", "5"], originStopId: "621S", destinationStopId: "631S", direction: "S" } },
          { id: "harlem-walk-3", mode: "walk", fromPlaceId: "grand-central", toPlaceId: "midtown-east", durationMin: 5, label: "Walk", details: "Short final block walk." },
        ],
      },
      {
        id: "harlem-personal-last-mile",
        name: "Personal micromobility for the Midtown finish",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "lighter riding",
        unlock: "Keeps the fast express ride, then covers the last stretch on your own micromobility instead of walking",
        parking: "Easy curbside parking near the Midtown East destination blocks",
        availability: "Bring your own bike or scooter",
        comfort: "Short final ride on broad Midtown streets",
        metrics: { totalMin: 30, walkMin: 10, micromobilityMin: 3, transfers: 0, costUsd: 3, confidence: 0.86 },
        legs: [
          { id: "harlem-walk-5", mode: "walk", fromPlaceId: "harlem", toPlaceId: "125-express", durationMin: 10, label: "Walk", details: "Walk to reliable express access." },
          { id: "harlem-subway-4", mode: "transit", fromPlaceId: "125-express", toPlaceId: "grand-central", durationMin: 17, label: "Subway", lineName: "4/5", details: "Direct express run into Midtown East.", mta: { routeIds: ["4", "5"], originStopId: "621S", destinationStopId: "631S", direction: "S" } },
          { id: "harlem-ride-3", mode: "personal_micromobility", fromPlaceId: "grand-central", toPlaceId: "midtown-east", durationMin: 3, label: "Ride", details: "Ride the last few blocks instead of finishing on foot." },
        ],
      },
      {
        id: "harlem-personal-through",
        name: "Personal micromobility on both sides",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "bring your bike through",
        unlock: "Ride to the express stop, bring your bike onto the train, then ride the final Midtown blocks too",
        parking: "Bring your bike through the subway leg, then park near the Midtown East destination blocks",
        availability: "Best if you are carrying your own bike or scooter all the way",
        comfort: "Fastest overall with very little walking",
        metrics: { totalMin: 27, walkMin: 0, micromobilityMin: 10, transfers: 0, costUsd: 3, confidence: 0.89 },
        legs: [
          { id: "harlem-ride-5", mode: "personal_micromobility", fromPlaceId: "harlem", toPlaceId: "125-express", durationMin: 7, label: "Ride", details: "Ride to the express station instead of starting on foot." },
          { id: "harlem-subway-6", mode: "transit", fromPlaceId: "125-express", toPlaceId: "grand-central", durationMin: 17, label: "Subway", lineName: "4/5", details: "Stay on the fast express run while bringing your bike or scooter through.", mta: { routeIds: ["4", "5"], originStopId: "621S", destinationStopId: "631S", direction: "S" } },
          { id: "harlem-ride-6", mode: "personal_micromobility", fromPlaceId: "grand-central", toPlaceId: "midtown-east", durationMin: 3, label: "Ride", details: "Use the same bike or scooter for the final Midtown East approach." },
        ],
      },
      {
        id: "harlem-shared",
        name: "Shared micromobility + express",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "rental-friendly speed",
        unlock: "Keeps the express gain while using a docked rental pickup",
        parking: "Dock near Grand Central or park in a designated curbside zone",
        availability: "Good Citi Bike density during peak hours",
        comfort: "Mostly calm connectors, slightly more friction at pickup/dropoff",
        metrics: { totalMin: 33, walkMin: 4, micromobilityMin: 8, transfers: 0, costUsd: 7.4, confidence: 0.85 },
        legs: [
          { id: "harlem-ride-2", mode: "shared_micromobility", fromPlaceId: "harlem", toPlaceId: "125-express", durationMin: 8, label: "Ride", details: "Pickup nearby shared micromobility and ride to express access." },
          { id: "harlem-subway-3", mode: "transit", fromPlaceId: "125-express", toPlaceId: "grand-central", durationMin: 20, label: "Subway", lineName: "4/5", details: "Express service into Midtown East.", mta: { routeIds: ["4", "5"], originStopId: "621S", destinationStopId: "631S", direction: "S" } },
          { id: "harlem-walk-4", mode: "walk", fromPlaceId: "grand-central", toPlaceId: "midtown-east", durationMin: 5, label: "Walk", details: "Dock and finish with a short walk." },
        ],
      },
      {
        id: "harlem-shared-last-mile",
        name: "Shared micromobility for the Midtown finish",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "dock near destination",
        unlock: "Uses the express ride, then replaces the last Midtown walk with a short shared ride",
        parking: "Reliable Citi Bike docks and curbside parking near Midtown East",
        availability: "Good shared pickup close to Grand Central",
        comfort: "Easy last-mile ride with a little dock friction",
        metrics: { totalMin: 34, walkMin: 10, micromobilityMin: 4, transfers: 0, costUsd: 6.9, confidence: 0.78 },
        legs: [
          { id: "harlem-walk-6", mode: "walk", fromPlaceId: "harlem", toPlaceId: "125-express", durationMin: 10, label: "Walk", details: "Walk to reliable express access." },
          { id: "harlem-subway-5", mode: "transit", fromPlaceId: "125-express", toPlaceId: "grand-central", durationMin: 20, label: "Subway", lineName: "4/5", details: "Express service into Midtown East.", mta: { routeIds: ["4", "5"], originStopId: "621S", destinationStopId: "631S", direction: "S" } },
          { id: "harlem-ride-4", mode: "shared_micromobility", fromPlaceId: "grand-central", toPlaceId: "midtown-east", durationMin: 4, label: "Ride", details: "Pick up a shared ride near Grand Central for the final segment." },
        ],
      },
    ],
  },
  {
    id: "williamsburg-to-fidi",
    title: "North Williamsburg to Financial District",
    headline: "A short ride to stronger J/Z access removes a slow transfer chain.",
    description:
      "Instead of committing to a longer first-mile walk, micromobility gets you to Marcy Av faster and preserves a direct downtown ride.",
    originId: "williamsburg",
    destinationId: "fidi",
    heroMetric: "Up to 15 min faster with less first-mile friction",
    routes: [
      {
        id: "williamsburg-baseline",
        name: "Transit-only baseline",
        micromobilityMode: "avoid",
        isTransitOnly: true,
        bestFor: "lowest complexity",
        unlock: "Uses the same direct downtown line, but with a slower walk to reach it",
        parking: "Not needed",
        availability: "Always available",
        comfort: "High",
        metrics: { totalMin: 41, walkMin: 13, micromobilityMin: 0, transfers: 0, costUsd: 3, confidence: 0.83 },
        legs: [
          { id: "williamsburg-walk-1", mode: "walk", fromPlaceId: "williamsburg", toPlaceId: "marcy-ave", durationMin: 11, label: "Walk", details: "Walk to the nearest dependable station entrance." },
          { id: "williamsburg-subway-1", mode: "transit", fromPlaceId: "marcy-ave", toPlaceId: "broad-st", durationMin: 24, label: "Subway", lineName: "J", details: "Direct downtown service, but slower overall because the station access is all on foot.", mta: { routeIds: ["J"], originStopId: "M16S", destinationStopId: "M23S", direction: "S" } },
          { id: "williamsburg-walk-2", mode: "walk", fromPlaceId: "broad-st", toPlaceId: "fidi", durationMin: 6, label: "Walk", details: "Street-level finish through the Financial District." },
        ],
      },
      {
        id: "williamsburg-personal",
        name: "Personal micromobility to Marcy Av",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "fastest arrival",
        unlock: "Straight shot to J/Z access into Lower Manhattan",
        parking: "Easy curbside lock-up close to the station",
        availability: "Bring your own bike or scooter",
        comfort: "Fast, direct neighborhood connectors",
        metrics: { totalMin: 26, walkMin: 5, micromobilityMin: 8, transfers: 0, costUsd: 3, confidence: 0.9 },
        legs: [
          { id: "williamsburg-ride-1", mode: "personal_micromobility", fromPlaceId: "williamsburg", toPlaceId: "marcy-ave", durationMin: 8, label: "Ride", details: "Skip the long walk and unlock the stronger station." },
          { id: "williamsburg-subway-2", mode: "transit", fromPlaceId: "marcy-ave", toPlaceId: "broad-st", durationMin: 13, label: "Subway", lineName: "J/Z", details: "Direct run downtown with no added transfer.", mta: { routeIds: ["J", "Z"], originStopId: "M16S", destinationStopId: "M23S", direction: "S" } },
          { id: "williamsburg-walk-3", mode: "walk", fromPlaceId: "broad-st", toPlaceId: "fidi", durationMin: 5, label: "Walk", details: "Short final walk near the destination." },
        ],
      },
      {
        id: "williamsburg-personal-last-mile",
        name: "Personal micromobility for the FiDi finish",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "shorter downtown finish",
        unlock: "Keeps the direct downtown line, then rides the last FiDi stretch instead of walking it",
        parking: "Easy curbside lock-up near the destination blocks",
        availability: "Bring your own bike or scooter",
        comfort: "Low-stress final segment through Lower Manhattan",
        metrics: { totalMin: 27, walkMin: 11, micromobilityMin: 3, transfers: 0, costUsd: 3, confidence: 0.84 },
        legs: [
          { id: "williamsburg-walk-5", mode: "walk", fromPlaceId: "williamsburg", toPlaceId: "marcy-ave", durationMin: 11, label: "Walk", details: "Walk to Marcy Av access." },
          { id: "williamsburg-subway-4", mode: "transit", fromPlaceId: "marcy-ave", toPlaceId: "broad-st", durationMin: 13, label: "Subway", lineName: "J/Z", details: "Direct run downtown.", mta: { routeIds: ["J", "Z"], originStopId: "M16S", destinationStopId: "M23S", direction: "S" } },
          { id: "williamsburg-ride-3", mode: "personal_micromobility", fromPlaceId: "broad-st", toPlaceId: "fidi", durationMin: 3, label: "Ride", details: "Ride the last few FiDi blocks instead of walking." },
        ],
      },
      {
        id: "williamsburg-personal-through",
        name: "Personal micromobility on both sides",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "carry-through commute",
        unlock: "Ride to Marcy, keep your own bike on the train, then cover the FiDi finish on wheels too",
        parking: "Bring your bike through the subway leg, then lock up near the FiDi destination blocks",
        availability: "Best with your own bike or scooter",
        comfort: "Fast downtown option with almost no walking",
        metrics: { totalMin: 24, walkMin: 0, micromobilityMin: 11, transfers: 0, costUsd: 3, confidence: 0.87 },
        legs: [
          { id: "williamsburg-ride-5", mode: "personal_micromobility", fromPlaceId: "williamsburg", toPlaceId: "marcy-ave", durationMin: 8, label: "Ride", details: "Ride to Marcy Av instead of walking the first mile." },
          { id: "williamsburg-subway-6", mode: "transit", fromPlaceId: "marcy-ave", toPlaceId: "broad-st", durationMin: 13, label: "Subway", lineName: "J/Z", details: "Take the direct downtown run while keeping your bike or scooter with you.", mta: { routeIds: ["J", "Z"], originStopId: "M16S", destinationStopId: "M23S", direction: "S" } },
          { id: "williamsburg-ride-6", mode: "personal_micromobility", fromPlaceId: "broad-st", toPlaceId: "fidi", durationMin: 3, label: "Ride", details: "Ride the final Financial District stretch instead of walking." },
        ],
      },
      {
        id: "williamsburg-shared",
        name: "Shared ride + direct downtown service",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "rental-first commute",
        unlock: "Maintains the direct downtown path with nearby dock access",
        parking: "Docking typically available close to Marcy Av",
        availability: "Strong Citi Bike coverage around the waterfront",
        comfort: "High comfort, but dock timing adds some friction",
        metrics: { totalMin: 29, walkMin: 6, micromobilityMin: 6, transfers: 0, costUsd: 6.8, confidence: 0.84 },
        legs: [
          { id: "williamsburg-ride-2", mode: "shared_micromobility", fromPlaceId: "williamsburg", toPlaceId: "marcy-ave", durationMin: 6, label: "Ride", details: "Pickup is close, with a short dock transfer near the station." },
          { id: "williamsburg-subway-3", mode: "transit", fromPlaceId: "marcy-ave", toPlaceId: "broad-st", durationMin: 17, label: "Subway", lineName: "J/Z", details: "Direct downtown service.", mta: { routeIds: ["J", "Z"], originStopId: "M16S", destinationStopId: "M23S", direction: "S" } },
          { id: "williamsburg-walk-4", mode: "walk", fromPlaceId: "broad-st", toPlaceId: "fidi", durationMin: 6, label: "Walk", details: "Dock and finish on foot." },
        ],
      },
      {
        id: "williamsburg-shared-last-mile",
        name: "Shared micromobility for the FiDi finish",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "dock near arrival",
        unlock: "Stays direct on the subway, then swaps the last walk for a short shared ride",
        parking: "Docking is usually available close to the FiDi destination core",
        availability: "Shared pickup is usually available near Broad St",
        comfort: "Simple downtown last-mile option with some dock friction",
        metrics: { totalMin: 32, walkMin: 11, micromobilityMin: 4, transfers: 0, costUsd: 6.8, confidence: 0.76 },
        legs: [
          { id: "williamsburg-walk-6", mode: "walk", fromPlaceId: "williamsburg", toPlaceId: "marcy-ave", durationMin: 11, label: "Walk", details: "Walk to Marcy Av access." },
          { id: "williamsburg-subway-5", mode: "transit", fromPlaceId: "marcy-ave", toPlaceId: "broad-st", durationMin: 17, label: "Subway", lineName: "J/Z", details: "Direct downtown service.", mta: { routeIds: ["J", "Z"], originStopId: "M16S", destinationStopId: "M23S", direction: "S" } },
          { id: "williamsburg-ride-4", mode: "shared_micromobility", fromPlaceId: "broad-st", toPlaceId: "fidi", durationMin: 4, label: "Ride", details: "Pick up a shared ride for the last FiDi segment." },
        ],
      },
    ],
  },
  {
    id: "astoria-to-midtown-west",
    title: "Astoria-Ditmars to Midtown West",
    headline: "Micromobility trims the first-mile drag and keeps the route transfer-light.",
    description:
      "A quick ride to Queensboro Plaza gives you cleaner line choice and avoids the slower walk-and-switch pattern.",
    originId: "astoria",
    destinationId: "midtown-west",
    heroMetric: "Up to 11 min faster with less walking",
    routes: [
      {
        id: "astoria-baseline",
        name: "Transit-only baseline",
        micromobilityMode: "avoid",
        isTransitOnly: true,
        bestFor: "simple transit trip",
        unlock: "Uses the direct Broadway service from the nearest station with no micromobility required",
        parking: "Not needed",
        availability: "Always available",
        comfort: "High",
        metrics: { totalMin: 42, walkMin: 8, micromobilityMin: 0, transfers: 0, costUsd: 3, confidence: 0.84 },
        legs: [
          { id: "astoria-walk-1", mode: "walk", fromPlaceId: "astoria", toPlaceId: "ditmars-blvd", durationMin: 1, label: "Walk", details: "Short access to the nearest Astoria station." },
          { id: "astoria-subway-1", mode: "transit", fromPlaceId: "ditmars-blvd", toPlaceId: "times-sq-broadway", durationMin: 33, label: "Subway", lineName: "N / W", details: "Direct Broadway service from Ditmars into Midtown West.", mta: { routeIds: ["N", "W"], originStopId: "R01S", destinationStopId: "R16S", direction: "S" } },
          { id: "astoria-walk-2", mode: "walk", fromPlaceId: "times-sq-broadway", toPlaceId: "midtown-west", durationMin: 8, label: "Walk", details: "Final blocks on foot into Midtown West." },
        ],
      },
      {
        id: "astoria-personal",
        name: "Personal micromobility via Queensboro Plaza",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "fastest arrival",
        unlock: "Gets you to a stronger node early and cuts the platform shuffle",
        parking: "Reliable parking near the plaza entrances",
        availability: "Bring your own bike or scooter",
        comfort: "Mostly protected north-south lanes",
        metrics: { totalMin: 27, walkMin: 4, micromobilityMin: 7, transfers: 0, costUsd: 3, confidence: 0.88 },
        legs: [
          { id: "astoria-ride-1", mode: "personal_micromobility", fromPlaceId: "astoria", toPlaceId: "queensboro-plaza", durationMin: 7, label: "Ride", details: "Quick ride to the stronger transit node." },
          { id: "astoria-subway-2", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "times-sq-broadway", durationMin: 16, label: "Subway", lineName: "N / W", details: "Cleaner one-seat ride into Midtown West.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R16S", direction: "S" } },
          { id: "astoria-walk-3", mode: "walk", fromPlaceId: "times-sq-broadway", toPlaceId: "midtown-west", durationMin: 4, label: "Walk", details: "Short finish on foot." },
        ],
      },
      {
        id: "astoria-personal-last-mile",
        name: "Personal micromobility for the final stretch",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "ride after transit",
        unlock: "Takes the direct train, then uses your own micromobility for the westbound finish",
        parking: "Reliable curbside parking near the Midtown West destination blocks",
        availability: "Bring your own bike or scooter",
        comfort: "Short post-subway ride across Midtown",
        metrics: { totalMin: 38, walkMin: 1, micromobilityMin: 4, transfers: 0, costUsd: 3, confidence: 0.83 },
        legs: [
          { id: "astoria-walk-5", mode: "walk", fromPlaceId: "astoria", toPlaceId: "ditmars-blvd", durationMin: 1, label: "Walk", details: "Short access to Ditmars." },
          { id: "astoria-subway-4", mode: "transit", fromPlaceId: "ditmars-blvd", toPlaceId: "times-sq-broadway", durationMin: 33, label: "Subway", lineName: "N / W", details: "Direct Broadway service into Midtown.", mta: { routeIds: ["N", "W"], originStopId: "R01S", destinationStopId: "R16S", direction: "S" } },
          { id: "astoria-ride-3", mode: "personal_micromobility", fromPlaceId: "times-sq-broadway", toPlaceId: "midtown-west", durationMin: 4, label: "Ride", details: "Ride the final westbound stretch instead of walking." },
        ],
      },
      {
        id: "astoria-personal-through",
        name: "Personal micromobility on both sides",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "almost no walking",
        unlock: "Ride to Queensboro Plaza, bring your bike through the train leg, then keep riding into Midtown West",
        parking: "Bring your bike through the subway leg, then park close to the Midtown West destination",
        availability: "Best if you are carrying your own bike or scooter",
        comfort: "Fast and efficient with the fewest walking segments",
        metrics: { totalMin: 27, walkMin: 0, micromobilityMin: 11, transfers: 0, costUsd: 3, confidence: 0.85 },
        legs: [
          { id: "astoria-ride-5", mode: "personal_micromobility", fromPlaceId: "astoria", toPlaceId: "queensboro-plaza", durationMin: 7, label: "Ride", details: "Ride straight to Queensboro Plaza access." },
          { id: "astoria-subway-6", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "times-sq-broadway", durationMin: 16, label: "Subway", lineName: "N / W", details: "Stay on the one-seat train while keeping your bike or scooter with you.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R16S", direction: "S" } },
          { id: "astoria-ride-6", mode: "personal_micromobility", fromPlaceId: "times-sq-broadway", toPlaceId: "midtown-west", durationMin: 4, label: "Ride", details: "Use the same bike or scooter for the final Midtown West stretch." },
        ],
      },
      {
        id: "astoria-shared",
        name: "Shared ride + one-seat subway",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "easy rental option",
        unlock: "Cuts the access walk while keeping the same stronger station choice",
        parking: "Docking is usually available near Queensboro Plaza",
        availability: "Good rental density during weekday peaks",
        comfort: "High comfort, slightly more dwell time at pickup",
        metrics: { totalMin: 30, walkMin: 5, micromobilityMin: 6, transfers: 0, costUsd: 6.6, confidence: 0.82 },
        legs: [
          { id: "astoria-ride-2", mode: "shared_micromobility", fromPlaceId: "astoria", toPlaceId: "queensboro-plaza", durationMin: 6, label: "Ride", details: "Shared pickup close to home base." },
          { id: "astoria-subway-3", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "times-sq-broadway", durationMin: 19, label: "Subway", lineName: "N / W", details: "Direct Manhattan run.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R16S", direction: "S" } },
          { id: "astoria-walk-4", mode: "walk", fromPlaceId: "times-sq-broadway", toPlaceId: "midtown-west", durationMin: 5, label: "Walk", details: "Short last block walk." },
        ],
      },
      {
        id: "astoria-shared-last-mile",
        name: "Shared micromobility for the final stretch",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "post-subway rental",
        unlock: "Keeps the direct train, then swaps the last walk for a short shared ride",
        parking: "Reliable docking or curbside parking near Midtown West",
        availability: "Good shared pickup near Times Square",
        comfort: "Simple last-mile rental option with some pickup friction",
        metrics: { totalMin: 39, walkMin: 1, micromobilityMin: 5, transfers: 0, costUsd: 6.4, confidence: 0.75 },
        legs: [
          { id: "astoria-walk-6", mode: "walk", fromPlaceId: "astoria", toPlaceId: "ditmars-blvd", durationMin: 1, label: "Walk", details: "Short access to Ditmars." },
          { id: "astoria-subway-5", mode: "transit", fromPlaceId: "ditmars-blvd", toPlaceId: "times-sq-broadway", durationMin: 33, label: "Subway", lineName: "N / W", details: "Direct Broadway service into Midtown.", mta: { routeIds: ["N", "W"], originStopId: "R01S", destinationStopId: "R16S", direction: "S" } },
          { id: "astoria-ride-4", mode: "shared_micromobility", fromPlaceId: "times-sq-broadway", toPlaceId: "midtown-west", durationMin: 5, label: "Ride", details: "Pick up a shared ride near Times Square for the final segment." },
        ],
      },
    ],
  },
  {
    id: "sunset-park-to-fidi",
    title: "Sunset Park to Financial District",
    headline: "Ride to Atlantic Terminal once, then stay on a stronger downtown run.",
    description:
      "The mixed-mode option trades a long residential walk and extra connection time for fast access to a higher-quality Brooklyn transit hub.",
    originId: "sunset-park",
    destinationId: "fidi",
    heroMetric: "Up to 18 min faster than transit-only",
    routes: [
      {
        id: "sunset-baseline",
        name: "Transit-only baseline",
        micromobilityMode: "avoid",
        isTransitOnly: true,
        bestFor: "transit-only trip",
        unlock: "Uses the nearby R train, but stays on the slower all-transit setup into Lower Manhattan",
        parking: "Not needed",
        availability: "Always available",
        comfort: "High",
        metrics: { totalMin: 40, walkMin: 11, micromobilityMin: 0, transfers: 0, costUsd: 3, confidence: 0.84 },
        legs: [
          { id: "sunset-walk-1", mode: "walk", fromPlaceId: "sunset-park", toPlaceId: "45-r", durationMin: 4, label: "Walk", details: "Walk to the nearby R platform in Sunset Park." },
          { id: "sunset-subway-1", mode: "transit", fromPlaceId: "45-r", toPlaceId: "whitehall", durationMin: 29, label: "Subway", lineName: "R", details: "Stay on the local R into Lower Manhattan without using a faster express hop.", mta: { routeIds: ["R"], originStopId: "R39N", destinationStopId: "R27N", direction: "N" } },
          { id: "sunset-walk-2", mode: "walk", fromPlaceId: "whitehall", toPlaceId: "fidi", durationMin: 7, label: "Walk", details: "Short final walk from Whitehall into the Financial District." },
        ],
      },
      {
        id: "sunset-personal",
        name: "Personal micromobility to Atlantic Terminal",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "biggest time save",
        unlock: "Reaches a major hub early and eliminates the slow setup",
        parking: "Easy lock-up near Atlantic entrances",
        availability: "Bring your own bike or scooter",
        comfort: "Longer ride, but efficient protected corridors",
        metrics: { totalMin: 34, walkMin: 6, micromobilityMin: 9, transfers: 0, costUsd: 3, confidence: 0.87 },
        legs: [
          { id: "sunset-ride-1", mode: "personal_micromobility", fromPlaceId: "sunset-park", toPlaceId: "atlantic-terminal", durationMin: 9, label: "Ride", details: "Direct ride to Brooklyn's strongest transfer-free option for this trip." },
          { id: "sunset-subway-2", mode: "transit", fromPlaceId: "atlantic-terminal", toPlaceId: "wall-st", durationMin: 19, label: "Subway", lineName: "4/5", details: "Fast downtown service with no extra switch.", mta: { routeIds: ["4", "5"], originStopId: "235N", destinationStopId: "419N", direction: "N" } },
          { id: "sunset-walk-3", mode: "walk", fromPlaceId: "wall-st", toPlaceId: "fidi", durationMin: 6, label: "Walk", details: "Short walk into the destination core." },
        ],
      },
      {
        id: "sunset-personal-last-mile",
        name: "Personal micromobility for the FiDi finish",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "direct downtown finish",
        unlock: "Uses strong downtown service, then rides the last FiDi stretch instead of walking",
        parking: "Easy lock-up close to the Financial District destination blocks",
        availability: "Bring your own bike or scooter",
        comfort: "Quick final segment once you are in Lower Manhattan",
        metrics: { totalMin: 35, walkMin: 12, micromobilityMin: 4, transfers: 0, costUsd: 3, confidence: 0.79 },
        legs: [
          { id: "sunset-walk-5", mode: "walk", fromPlaceId: "sunset-park", toPlaceId: "atlantic-terminal", durationMin: 12, label: "Walk", details: "Walk to Atlantic Terminal access." },
          { id: "sunset-subway-4", mode: "transit", fromPlaceId: "atlantic-terminal", toPlaceId: "wall-st", durationMin: 19, label: "Subway", lineName: "4/5", details: "Fast downtown service.", mta: { routeIds: ["4", "5"], originStopId: "235N", destinationStopId: "419N", direction: "N" } },
          { id: "sunset-ride-3", mode: "personal_micromobility", fromPlaceId: "wall-st", toPlaceId: "fidi", durationMin: 4, label: "Ride", details: "Ride the final Lower Manhattan stretch instead of walking." },
        ],
      },
      {
        id: "sunset-personal-through",
        name: "Personal micromobility on both sides",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "full carry-through route",
        unlock: "Ride to Atlantic Terminal, keep your bike with you on the subway, then finish FiDi on the same vehicle",
        parking: "Bring your bike through the subway leg, then lock up near the Financial District destination",
        availability: "Best with your own bike or scooter",
        comfort: "Longest ride burden, but still the cleanest end-to-end path",
        metrics: { totalMin: 32, walkMin: 0, micromobilityMin: 13, transfers: 0, costUsd: 3, confidence: 0.83 },
        legs: [
          { id: "sunset-ride-5", mode: "personal_micromobility", fromPlaceId: "sunset-park", toPlaceId: "atlantic-terminal", durationMin: 9, label: "Ride", details: "Ride to Atlantic Terminal instead of starting with a long walk." },
          { id: "sunset-subway-6", mode: "transit", fromPlaceId: "atlantic-terminal", toPlaceId: "wall-st", durationMin: 19, label: "Subway", lineName: "4/5", details: "Stay on the fast downtown train while bringing your bike or scooter with you.", mta: { routeIds: ["4", "5"], originStopId: "235N", destinationStopId: "419N", direction: "N" } },
          { id: "sunset-ride-6", mode: "personal_micromobility", fromPlaceId: "wall-st", toPlaceId: "fidi", durationMin: 4, label: "Ride", details: "Use the same bike or scooter for the final FiDi stretch." },
        ],
      },
      {
        id: "sunset-shared",
        name: "Shared ride to Barclays access",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "shared mobility commute",
        unlock: "Preserves the hub advantage with slightly more pickup friction",
        parking: "Docking usually available close to the terminal",
        availability: "Moderate Citi Bike coverage, best on weekdays",
        comfort: "High comfort with added docking overhead",
        metrics: { totalMin: 39, walkMin: 5, micromobilityMin: 8, transfers: 0, costUsd: 7.1, confidence: 0.8 },
        legs: [
          { id: "sunset-ride-2", mode: "shared_micromobility", fromPlaceId: "sunset-park", toPlaceId: "atlantic-terminal", durationMin: 8, label: "Ride", details: "Shared pickup to a stronger transit node." },
          { id: "sunset-subway-3", mode: "transit", fromPlaceId: "atlantic-terminal", toPlaceId: "wall-st", durationMin: 26, label: "Subway", lineName: "4/5", details: "Fast run downtown.", mta: { routeIds: ["4", "5"], originStopId: "235N", destinationStopId: "419N", direction: "N" } },
          { id: "sunset-walk-4", mode: "walk", fromPlaceId: "wall-st", toPlaceId: "fidi", durationMin: 5, label: "Walk", details: "Short finish on foot." },
        ],
      },
      {
        id: "sunset-shared-last-mile",
        name: "Shared micromobility for the FiDi finish",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "last-mile rental",
        unlock: "Keeps the fast downtown train, then uses a short shared ride for the final FiDi approach",
        parking: "Good docking and curbside parking options around Wall St",
        availability: "Shared pickup is usually available in the Wall St area",
        comfort: "Fast final segment with moderate pickup friction",
        metrics: { totalMin: 37, walkMin: 12, micromobilityMin: 5, transfers: 0, costUsd: 6.9, confidence: 0.73 },
        legs: [
          { id: "sunset-walk-6", mode: "walk", fromPlaceId: "sunset-park", toPlaceId: "atlantic-terminal", durationMin: 12, label: "Walk", details: "Walk to Atlantic Terminal access." },
          { id: "sunset-subway-5", mode: "transit", fromPlaceId: "atlantic-terminal", toPlaceId: "wall-st", durationMin: 19, label: "Subway", lineName: "4/5", details: "Fast downtown service.", mta: { routeIds: ["4", "5"], originStopId: "235N", destinationStopId: "419N", direction: "N" } },
          { id: "sunset-ride-4", mode: "shared_micromobility", fromPlaceId: "wall-st", toPlaceId: "fidi", durationMin: 5, label: "Ride", details: "Use shared micromobility for the final Lower Manhattan segment." },
        ],
      },
    ],
  },
  {
    id: "lic-to-flatiron",
    title: "Long Island City to Flatiron",
    headline: "Even short trips benefit when a quick ride reaches a stronger Broadway stop.",
    description:
      "This scenario shows the lighter-weight win: micromobility can shift you onto a cleaner Broadway path with a shorter finish into Flatiron.",
    originId: "lic",
    destinationId: "flatiron",
    heroMetric: "Up to 6 min faster with a cleaner finish",
    routes: [
      {
        id: "lic-baseline",
        name: "Transit-only baseline",
        micromobilityMode: "avoid",
        isTransitOnly: true,
        bestFor: "lowest cost",
        unlock: "A solid default path with more walking than ideal",
        parking: "Not needed",
        availability: "Always available",
        comfort: "High",
        metrics: { totalMin: 25, walkMin: 8, micromobilityMin: 0, transfers: 0, costUsd: 3, confidence: 0.88 },
        legs: [
          { id: "lic-walk-1", mode: "walk", fromPlaceId: "lic", toPlaceId: "queensboro-plaza", durationMin: 6, label: "Walk", details: "Initial walk to Broadway service." },
          { id: "lic-subway-1", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "23-r", durationMin: 13, label: "Subway", lineName: "N / W", details: "Broadway service with a short final walk into Flatiron.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R19S", direction: "S" } },
          { id: "lic-walk-2", mode: "walk", fromPlaceId: "23-r", toPlaceId: "flatiron", durationMin: 6, label: "Walk", details: "Final approach on foot." },
        ],
      },
      {
        id: "lic-personal",
        name: "Personal micromobility + cleaner station access",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "smoothest trip",
        unlock: "Cuts the first-mile walk while keeping a clean Broadway ride",
        parking: "Easy parking near Court Sq",
        availability: "Bring your own bike or scooter",
        comfort: "Short, low-stress ride",
        metrics: { totalMin: 19, walkMin: 3, micromobilityMin: 5, transfers: 0, costUsd: 3, confidence: 0.9 },
        legs: [
          { id: "lic-ride-1", mode: "personal_micromobility", fromPlaceId: "lic", toPlaceId: "queensboro-plaza", durationMin: 5, label: "Ride", details: "Use micromobility to reduce the slow access walk." },
          { id: "lic-subway-2", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "23-r", durationMin: 11, label: "Subway", lineName: "N / W", details: "Broadway service into the Flatiron core.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R19S", direction: "S" } },
          { id: "lic-walk-3", mode: "walk", fromPlaceId: "23-r", toPlaceId: "flatiron", durationMin: 3, label: "Walk", details: "Short finish from the station." },
        ],
      },
      {
        id: "lic-personal-last-mile",
        name: "Personal micromobility for the Flatiron finish",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "ride after transit",
        unlock: "Keeps the clean Broadway ride, then uses your own micromobility for the final Flatiron blocks",
        parking: "Easy parking near the Flatiron destination core",
        availability: "Bring your own bike or scooter",
        comfort: "Very short final ride after the subway",
        metrics: { totalMin: 20, walkMin: 6, micromobilityMin: 3, transfers: 0, costUsd: 3, confidence: 0.84 },
        legs: [
          { id: "lic-walk-5", mode: "walk", fromPlaceId: "lic", toPlaceId: "queensboro-plaza", durationMin: 6, label: "Walk", details: "Walk to Broadway service." },
          { id: "lic-subway-4", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "23-r", durationMin: 11, label: "Subway", lineName: "N / W", details: "Broadway service into Flatiron.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R19S", direction: "S" } },
          { id: "lic-ride-3", mode: "personal_micromobility", fromPlaceId: "23-r", toPlaceId: "flatiron", durationMin: 3, label: "Ride", details: "Ride the final Flatiron stretch instead of walking." },
        ],
      },
      {
        id: "lic-personal-through",
        name: "Personal micromobility on both sides",
        micromobilityMode: "personal",
        isTransitOnly: false,
        bestFor: "zero-walk finish",
        unlock: "Ride to Broadway service, keep your bike on the train, then ride directly into Flatiron after the subway",
        parking: "Bring your bike through the subway leg, then park close to the Flatiron destination",
        availability: "Best with your own bike or scooter",
        comfort: "Smoothest door-to-door option with minimal walking",
        metrics: { totalMin: 18, walkMin: 0, micromobilityMin: 8, transfers: 0, costUsd: 3, confidence: 0.88 },
        legs: [
          { id: "lic-ride-5", mode: "personal_micromobility", fromPlaceId: "lic", toPlaceId: "queensboro-plaza", durationMin: 5, label: "Ride", details: "Ride to Queensboro Plaza instead of walking the access segment." },
          { id: "lic-subway-6", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "23-r", durationMin: 10, label: "Subway", lineName: "N / W", details: "Take the direct Broadway train while keeping your bike or scooter with you.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R19S", direction: "S" } },
          { id: "lic-ride-6", mode: "personal_micromobility", fromPlaceId: "23-r", toPlaceId: "flatiron", durationMin: 3, label: "Ride", details: "Use the same bike or scooter for the final Flatiron blocks." },
        ],
      },
      {
        id: "lic-shared",
        name: "Shared micromobility + direct subway",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "rental-ready option",
        unlock: "Same route shape with convenient dock access",
        parking: "Reliable docks near Court Sq and Flatiron",
        availability: "Very good Citi Bike coverage",
        comfort: "High comfort, best for commuters without their own ride",
        metrics: { totalMin: 22, walkMin: 3, micromobilityMin: 5, transfers: 0, costUsd: 6.1, confidence: 0.84 },
        legs: [
          { id: "lic-ride-2", mode: "shared_micromobility", fromPlaceId: "lic", toPlaceId: "queensboro-plaza", durationMin: 5, label: "Ride", details: "Pickup nearby shared bike or scooter." },
          { id: "lic-subway-3", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "23-r", durationMin: 14, label: "Subway", lineName: "N / W", details: "Direct trip into Manhattan.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R19S", direction: "S" } },
          { id: "lic-walk-4", mode: "walk", fromPlaceId: "23-r", toPlaceId: "flatiron", durationMin: 3, label: "Walk", details: "Dock and walk the final blocks." },
        ],
      },
      {
        id: "lic-shared-last-mile",
        name: "Shared micromobility for the Flatiron finish",
        micromobilityMode: "shared",
        isTransitOnly: false,
        bestFor: "dock near destination",
        unlock: "Takes the direct Broadway ride, then swaps the last walk for a short shared trip",
        parking: "Reliable docks near the Flatiron destination",
        availability: "Strong shared pickup around 23 St",
        comfort: "Quick last-mile rental option",
        metrics: { totalMin: 24, walkMin: 6, micromobilityMin: 4, transfers: 0, costUsd: 6.1, confidence: 0.76 },
        legs: [
          { id: "lic-walk-6", mode: "walk", fromPlaceId: "lic", toPlaceId: "queensboro-plaza", durationMin: 6, label: "Walk", details: "Walk to Broadway service." },
          { id: "lic-subway-5", mode: "transit", fromPlaceId: "queensboro-plaza", toPlaceId: "23-r", durationMin: 14, label: "Subway", lineName: "N / W", details: "Direct Broadway trip into Manhattan.", mta: { routeIds: ["N", "W"], originStopId: "R09S", destinationStopId: "R19S", direction: "S" } },
          { id: "lic-ride-4", mode: "shared_micromobility", fromPlaceId: "23-r", toPlaceId: "flatiron", durationMin: 4, label: "Ride", details: "Use a shared ride for the final Flatiron segment." },
        ],
      },
    ],
  },
];

export const assistantQuestions = [
  "Why is this route faster?",
  "Can I do this without a rental?",
  "Show me the least walking option.",
  "Which route has the fewest transfers?",
  "Where do I park or dock at the end?",
  "How much time does micromobility actually save here?",
];
