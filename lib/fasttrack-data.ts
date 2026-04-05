export type Borough =
  | "Manhattan"
  | "Brooklyn"
  | "Queens"
  | "Bronx"
  | "Staten Island";

export type TravelMode =
  | "walk"
  | "transit"
  | "personal_micromobility"
  | "shared_micromobility";

export type PlannerGoal =
  | "fastest"
  | "fewest_transfers"
  | "least_walking"
  | "balance";

export type MicromobilityMode = "any" | "personal" | "shared" | "avoid";
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
  micromobilityMode: MicromobilityMode;
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
        unlock: "Nearest neighborhood station, but a slower downtown path",
        parking: "Not needed",
        availability: "Always available",
        comfort: "High",
        metrics: { totalMin: 52, walkMin: 15, micromobilityMin: 0, transfers: 1, costUsd: 3, confidence: 0.81 },
        legs: [
          { id: "sunset-walk-1", mode: "walk", fromPlaceId: "sunset-park", toPlaceId: "atlantic-terminal", durationMin: 12, label: "Walk", details: "Long first-mile walk to start the trip." },
          { id: "sunset-subway-1", mode: "transit", fromPlaceId: "atlantic-terminal", toPlaceId: "wall-st", durationMin: 31, label: "Subway", lineName: "R + transfer", details: "Downtown run with a connection before Lower Manhattan." },
          { id: "sunset-walk-2", mode: "walk", fromPlaceId: "wall-st", toPlaceId: "fidi", durationMin: 9, label: "Walk", details: "Street-level finish through FiDi." },
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
