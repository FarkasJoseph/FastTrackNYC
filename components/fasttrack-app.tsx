"use client";

import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowDown,
  Bike,
  Bus,
  Clock3,
  Footprints,
  Flag,
  LoaderCircle,
  MapPin,
  Route as RouteIcon,
  Sparkles,
  TrainFront,
  Waves,
  X,
} from "lucide-react";
import { LocationAutocompleteField } from "@/components/location-autocomplete-field";
import { MapStage } from "@/components/map-stage";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PlannerRouteSurfaceGeometry } from "@/lib/mapbox/types";
import type { LocationSearchOption } from "@/lib/location-search/types";
import { PlannerRouteMobilityContext } from "@/lib/micromobility/types";
import { PlannerRouteIntel } from "@/lib/mta/types";
import type { PlannerPlanRequest, PlannerPlanResponse, PlannerRouteRequest } from "@/lib/planner/payload";
import {
  assistantQuestions,
  PlannerPreferences,
  RouteLeg,
  scenarios,
} from "@/lib/fasttrack-data";
import {
  buildPlannerPlan,
  createTripLocationFromPlace,
  formatMoney,
  type PlannerPlan,
  type TripLocation,
} from "@/lib/fasttrack-routing";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type RouteRuntimeSummary = {
  totalMin: number;
  legDurations: Record<string, number>;
  transitLegs: PlannerRouteIntel["transitLegs"];
  surfaceLegGeometries: PlannerRouteSurfaceGeometry["legs"];
};

const MAX_LIVE_WAIT_MIN = 90;
const MAX_RUNTIME_WAIT_MIN = 30;
const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedRouteValue<T> = {
  value: T;
  cachedAt: number;
};

const plannerPlanCache = new Map<string, CachedRouteValue<PlannerPlanResponse>>();
const routeIntelCache = new Map<string, CachedRouteValue<PlannerRouteIntel>>();
const routeSurfaceCache = new Map<string, CachedRouteValue<PlannerRouteSurfaceGeometry>>();
const micromobilityContextCache = new Map<
  string,
  CachedRouteValue<PlannerRouteMobilityContext>
>();

const modeOptions: {
  id: PlannerPreferences["tripMode"];
  shortLabel: string;
}[] = [
  { id: "fastest", shortLabel: "Fastest" },
  { id: "mixed", shortLabel: "Mixed" },
  { id: "transit", shortLabel: "Transit" },
  { id: "bike_walk", shortLabel: "Bike/Walk" },
];

const demoExamples = [
  {
    id: "harlem-midtown-east",
    title: "South Harlem to Midtown East",
    preview: "Save 7 min.",
    blurb: "",
    origin: {
      id: "demo-harlem",
      label: "South Harlem",
      subtitle: "South Harlem, Manhattan, NY",
      lat: 40.8044,
      lng: -73.9557,
    },
    destination: {
      id: "demo-midtown-east",
      label: "Midtown East",
      subtitle: "Midtown East, Manhattan, NY",
      lat: 40.7527,
      lng: -73.9772,
    },
  },
  {
    id: "park-slope-fidi",
    title: "Park Slope to Financial District",
    preview: "Save 7 min.",
    blurb: "",
    origin: {
      id: "demo-park-slope",
      label: "Park Slope",
      subtitle: "Park Slope, Brooklyn, NY",
      lat: 40.672,
      lng: -73.977,
    },
    destination: {
      id: "demo-fidi",
      label: "Financial District",
      subtitle: "Financial District, Manhattan, NY",
      lat: 40.7075,
      lng: -74.0113,
    },
  },
  {
    id: "greenpoint-union-square",
    title: "Greenpoint to Union Square",
    preview: "Save 4 min.",
    blurb: "",
    origin: {
      id: "demo-greenpoint",
      label: "Greenpoint",
      subtitle: "Greenpoint, Brooklyn, NY",
      lat: 40.7295,
      lng: -73.954,
    },
    destination: {
      id: "demo-union-square",
      label: "Union Square",
      subtitle: "Union Square, Manhattan, NY",
      lat: 40.7359,
      lng: -73.9911,
    },
  },
] satisfies Array<{
  id: string;
  title: string;
  preview: string;
  blurb: string;
  origin: Omit<LocationSearchOption, "source">;
  destination: Omit<LocationSearchOption, "source">;
}>;

function getFreshCachedValue<T>(
  cache: Map<string, CachedRouteValue<T>>,
  key: string,
) {
  const cached = cache.get(key);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.cachedAt > ROUTE_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedValue<T>(
  cache: Map<string, CachedRouteValue<T>>,
  key: string,
  value: T,
) {
  cache.set(key, {
    value,
    cachedAt: Date.now(),
  });
}

export function FastTrackApp() {
  const initialOriginOption = buildDemoLocationOption("lic");
  const initialDestinationOption = buildDefaultAddressOption();
  const [originSelection, setOriginSelection] =
    useState<LocationSearchOption>(initialOriginOption);
  const [destinationSelection, setDestinationSelection] =
    useState<LocationSearchOption>(initialDestinationOption);
  const [preferences, setPreferences] = useState<PlannerPreferences>({
    goal: "fastest",
    tripMode: "fastest",
  });
  const initialPlan = useMemo(
    () =>
      buildPlannerPlan(
        toTripLocation(initialOriginOption),
        toTripLocation(initialDestinationOption),
        {
          goal: "fastest",
          tripMode: "fastest",
        },
      ),
    [initialDestinationOption, initialOriginOption],
  );
  const [plan, setPlan] = useState<PlannerPlan>(initialPlan);
  const [planError, setPlanError] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState(initialPlan.recommendedRoute.id);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [demoStoriesOpen, setDemoStoriesOpen] = useState(false);
  const [demoStoriesDismissed, setDemoStoriesDismissed] = useState(false);
  const [liveIntel, setLiveIntel] = useState<PlannerRouteIntel | null>(null);
  const [liveIntelError, setLiveIntelError] = useState<{
    routeId: string;
    message: string;
  } | null>(null);
  const [surfaceGeometry, setSurfaceGeometry] =
    useState<PlannerRouteSurfaceGeometry | null>(null);
  const [surfaceGeometryError, setSurfaceGeometryError] = useState<{
    routeId: string;
    message: string;
  } | null>(null);
  const [mobilityContext, setMobilityContext] =
    useState<PlannerRouteMobilityContext | null>(null);
  const [mobilityContextError, setMobilityContextError] = useState<{
    routeId: string;
    message: string;
  } | null>(null);
  const [routeRuntimeState, setRouteRuntimeState] = useState<{
    planKey: string;
    entries: Record<string, RouteRuntimeSummary>;
  }>({
    planKey: `${initialOriginOption.id}-${initialDestinationOption.id}-fastest`,
    entries: {},
  });
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "assistant-intro",
      role: "assistant",
      content:
        "FastTrack NYC highlights when micromobility changes your access to better transit, not just when it shortens a walk.",
    },
  ]);
  const demoOriginOptions = Array.from(
    new Set(scenarios.map((scenario) => scenario.originId)),
  ).map((placeId) => buildDemoLocationOption(placeId));
  const demoDestinationOptions = Array.from(
    new Set(scenarios.map((scenario) => scenario.destinationId)),
  ).map((placeId) => buildDemoLocationOption(placeId));
  const originLocation = useMemo(
    () => toTripLocation(originSelection),
    [originSelection],
  );
  const destinationLocation = useMemo(
    () => toTripLocation(destinationSelection),
    [destinationSelection],
  );
  const currentPlanKey = useMemo(
    () =>
      `${originSelection.id}-${destinationSelection.id}-${preferences.tripMode}`,
    [destinationSelection.id, originSelection.id, preferences.tripMode],
  );
  const [loadedPlanKey, setLoadedPlanKey] = useState(currentPlanKey);
  const planLoading = loadedPlanKey !== currentPlanKey;
  const isPlannerRefreshing = planLoading;
  const routeRuntimeById = useMemo(
    () =>
      routeRuntimeState.planKey === currentPlanKey ? routeRuntimeState.entries : {},
    [currentPlanKey, routeRuntimeState],
  );
  const runtimeSortedRoutes = [...plan.rankedRoutes].sort((left, right) => {
    const leftTotal = routeRuntimeById[left.id]?.totalMin ?? left.metrics.totalMin;
    const rightTotal = routeRuntimeById[right.id]?.totalMin ?? right.metrics.totalMin;

    return leftTotal - rightTotal;
  });
  const defaultActiveRoute = getDefaultActiveRoute(
    runtimeSortedRoutes,
    plan.transitOnlyRoute,
    preferences.tripMode,
  );
  const activeRoute =
    runtimeSortedRoutes.find((route) => route.id === activeRouteId) ??
    defaultActiveRoute ??
    plan.recommendedRoute;
  const alternateRoutes = runtimeSortedRoutes.filter((route) => route.id !== activeRoute.id);
  const modeMatchedAlternateRoutes = alternateRoutes.filter((route) =>
    routeMatchesTripMode(route, preferences.tripMode),
  );
  const suggestedRoutes =
    preferences.tripMode !== "bike_walk"
      ? modeMatchedAlternateRoutes.slice(0, 2)
      : (() => {
          const desiredModes: Array<PlannerPlan["recommendedRoute"]["micromobilityMode"]> = [
            "avoid",
            "personal",
            "shared",
          ];

          const coveredModes = new Set([activeRoute.micromobilityMode]);
          const curatedSuggestions = desiredModes
            .filter((mode) => !coveredModes.has(mode))
            .map((mode) =>
              modeMatchedAlternateRoutes.find((route) => route.micromobilityMode === mode),
            )
            .filter(
              (
                route,
                index,
                allRoutes,
              ): route is NonNullable<typeof route> => {
                if (!route) {
                  return false;
                }

                return (
                  allRoutes.findIndex((candidate) => candidate?.id === route.id) === index
                );
              },
            );

          if (curatedSuggestions.length >= 2) {
            return curatedSuggestions.slice(0, 2);
          }

          return [
            ...curatedSuggestions,
            ...modeMatchedAlternateRoutes.filter(
              (route) => !curatedSuggestions.some((candidate) => candidate.id === route.id),
            ),
          ].slice(0, 2);
        })();
  const alternateRouteOverlays = suggestedRoutes.map((route) => {
    const runtime = routeRuntimeById[route.id];

    return {
      route,
      totalMin: runtime?.totalMin ?? route.metrics.totalMin,
      legDurations: runtime?.legDurations,
      transitLegs: runtime?.transitLegs,
      surfaceLegGeometries: runtime?.surfaceLegGeometries,
    };
  });
  const runtimePrefetchRoutes = useMemo(() => {
    const seedRoutes = [
      plan.recommendedRoute,
      plan.transitOnlyRoute,
      ...plan.rankedRoutes.filter((route) => routeMatchesTripMode(route, preferences.tripMode)),
    ];

    const uniqueRoutes: PlannerPlan["rankedRoutes"] = [];
    const seenRouteIds = new Set<string>();

    for (const route of seedRoutes) {
      if (seenRouteIds.has(route.id)) {
        continue;
      }

      seenRouteIds.add(route.id);
      uniqueRoutes.push(route);

      if (uniqueRoutes.length >= 4) {
        break;
      }
    }

    return uniqueRoutes;
  }, [plan.rankedRoutes, plan.recommendedRoute, plan.transitOnlyRoute, preferences.tripMode]);
  const primaryTransitIntel = liveIntel?.transitLegs[0];
  const activeRouteHasTransit = activeRoute.legs.some((leg) => leg.mode === "transit");
  const activeRouteHasMicromobility = activeRoute.legs.some(
    (leg) =>
      leg.mode === "personal_micromobility" || leg.mode === "shared_micromobility",
  );
  const activeRouteRuntimeSummary = buildRouteRuntimeSummary(
    activeRoute,
    liveIntel?.transitLegs ?? [],
    surfaceGeometry?.routeId === activeRoute.id ? surfaceGeometry.legs : [],
  );
  const activeTransitLegRuntimeDetails = buildTransitLegRuntimeDetails(
    activeRoute,
    liveIntel?.transitLegs ?? [],
    surfaceGeometry?.routeId === activeRoute.id ? surfaceGeometry.legs : [],
  );
  const activeRouteHasUsableLiveDeparture =
    liveIntel?.transitLegs.some((transitLeg) => hasUsableLiveDeparture(transitLeg)) ?? false;
  const getDisplayedLegDuration = (leg: RouteLeg) =>
    activeRouteRuntimeSummary.legDurations[leg.id] ?? leg.durationMin;
  const activeRouteDisplayedTotalMin =
    routeRuntimeById[activeRoute.id]?.totalMin ?? activeRouteRuntimeSummary.totalMin;
  const displayedTransferCount = Math.max(
    0,
    activeRoute.legs.filter((leg) => leg.mode === "transit").length - 1,
  );
  const computedTransitSummary =
    primaryTransitIntel?.status === "ok" &&
    primaryTransitIntel.fromStation &&
    primaryTransitIntel.toStation
      ? `${primaryTransitIntel.lines.map((line) => line.shortName).join("/")} from ${primaryTransitIntel.fromStation.name} to ${primaryTransitIntel.toStation.name}${
          displayedTransferCount > 0 ? ` with ${displayedTransferCount} transfer${displayedTransferCount === 1 ? "" : "s"}` : " direct"
        }.`
      : activeRoute.unlock;
  const liveIntelStatus =
    liveIntel?.routeId === activeRoute.id
      ? "ready"
      : liveIntelError?.routeId === activeRoute.id
        ? "error"
        : "loading";
  const activeRouteHasStreetLegs = activeRoute.legs.some(
    (leg) =>
      leg.mode === "walk" ||
      leg.mode === "personal_micromobility" ||
      leg.mode === "shared_micromobility",
  );
  const surfaceGeometryStatus =
    !activeRouteHasStreetLegs
      ? "ready"
      : surfaceGeometry?.routeId === activeRoute.id
        ? "ready"
        : surfaceGeometryError?.routeId === activeRoute.id
          ? "error"
          : "loading";
  const mobilityContextStatus =
    !activeRouteHasMicromobility
      ? "ready"
      : mobilityContext?.routeId === activeRoute.id
        ? "ready"
        : mobilityContextError?.routeId === activeRoute.id
          ? "error"
          : "loading";
  const activeSharedStations =
    mobilityContext?.routeId === activeRoute.id ? mobilityContext.sharedStations : [];
  const activeParkingSpots =
    mobilityContext?.routeId === activeRoute.id ? mobilityContext.parkingSpots : [];
  const recommendedPickupStation = activeSharedStations.find(
    (station) => station.role === "pickup",
  );
  const recommendedDropoffStation = activeSharedStations.find(
    (station) => station.role === "dropoff",
  );
  const recommendedParkingSpot = activeParkingSpots[0];
  const routeAccessSummary = buildRouteAccessSummary({
    activeRoute,
    pickupStation: recommendedPickupStation,
    dropoffStation: recommendedDropoffStation,
    parkingSpot: recommendedParkingSpot,
  });

  useEffect(() => {
    const controller = new AbortController();
    const payload: PlannerPlanRequest = {
      origin: originLocation,
      destination: destinationLocation,
      preferences,
    };
    const cacheKey = JSON.stringify(payload);
    const cachedPlan = getFreshCachedValue(plannerPlanCache, cacheKey);

    if (cachedPlan) {
      const nextDefaultRoute = getDefaultActiveRoute(
        cachedPlan.rankedRoutes,
        cachedPlan.transitOnlyRoute,
        preferences.tripMode,
      );

      startTransition(() => {
        setPlan(cachedPlan);
        setPlanError(null);
        setLoadedPlanKey(currentPlanKey);
        setActiveRouteId((currentRouteId) =>
          preferences.tripMode === "fastest"
            ? cachedPlan.recommendedRoute.id
            : cachedPlan.rankedRoutes.some((route) => route.id === currentRouteId) &&
                routeMatchesTripMode(
                  cachedPlan.rankedRoutes.find((route) => route.id === currentRouteId)!,
                  preferences.tripMode,
                )
              ? currentRouteId
              : nextDefaultRoute?.id ?? cachedPlan.recommendedRoute.id,
        );
      });
      return () => controller.abort();
    }

    void fetch("/api/planner/plan", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(errorPayload?.error ?? "Failed to compute planner routes.");
        }

        return response.json() as Promise<PlannerPlanResponse>;
      })
      .then((payload) => {
        setCachedValue(plannerPlanCache, cacheKey, payload);
        setPlan(payload);
        setPlanError(null);
        setLoadedPlanKey(currentPlanKey);
        const nextDefaultRoute = getDefaultActiveRoute(
          payload.rankedRoutes,
          payload.transitOnlyRoute,
          preferences.tripMode,
        );
        setActiveRouteId(
          preferences.tripMode === "fastest"
            ? payload.recommendedRoute.id
            : nextDefaultRoute?.id ?? payload.recommendedRoute.id,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setPlanError(
          error instanceof Error ? error.message : "Failed to compute planner routes.",
        );
        setLoadedPlanKey(currentPlanKey);
      })
      .finally(() => undefined);

    return () => controller.abort();
  }, [currentPlanKey, destinationLocation, originLocation, preferences]);

  useEffect(() => {
    if (!activeRouteHasTransit) {
      return;
    }

    const controller = new AbortController();
    const payload: PlannerRouteRequest = {
      route: activeRoute,
      placeList: plan.placeList,
    };
    const cacheKey = JSON.stringify(payload);
    const cachedIntel = getFreshCachedValue(routeIntelCache, cacheKey);

    if (cachedIntel) {
      startTransition(() => {
        setLiveIntel(cachedIntel);
        setLiveIntelError(null);
      });
      return () => controller.abort();
    }

    void fetch("/api/mta/route-intel", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Failed to load live MTA data.");
        }

        return response.json() as Promise<PlannerRouteIntel>;
      })
      .then((payload) => {
        setCachedValue(routeIntelCache, cacheKey, payload);
        setLiveIntel(payload);
        setLiveIntelError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setLiveIntel(null);
        setLiveIntelError(
          {
            routeId: activeRoute.id,
            message:
              error instanceof Error
                ? error.message
                : "Failed to load live MTA data.",
          },
        );
      });

    return () => controller.abort();
  }, [activeRoute, activeRouteHasTransit, plan.placeList]);

  useEffect(() => {
    if (!activeRouteHasStreetLegs) {
      return;
    }

    const controller = new AbortController();

    const payload: PlannerRouteRequest = {
      route: activeRoute,
      placeList: plan.placeList,
    };
    const cacheKey = JSON.stringify(payload);
    const cachedSurface = getFreshCachedValue(routeSurfaceCache, cacheKey);

    if (cachedSurface) {
      startTransition(() => {
        setSurfaceGeometry(cachedSurface);
        setSurfaceGeometryError(null);
      });
      return () => controller.abort();
    }

    void fetch("/api/map/route-surface", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Failed to load route surface geometry.");
        }

        return response.json() as Promise<PlannerRouteSurfaceGeometry>;
      })
      .then((payload) => {
        setCachedValue(routeSurfaceCache, cacheKey, payload);
        setSurfaceGeometry(payload);
        setSurfaceGeometryError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setSurfaceGeometry(null);
        setSurfaceGeometryError({
          routeId: activeRoute.id,
          message:
            error instanceof Error
              ? error.message
              : "Failed to load route surface geometry.",
        });
      });

    return () => controller.abort();
  }, [activeRoute, activeRouteHasStreetLegs, plan.placeList]);

  useEffect(() => {
    if (!activeRouteHasMicromobility) {
      return;
    }

    const controller = new AbortController();

    const payload: PlannerRouteRequest = {
      route: activeRoute,
      placeList: plan.placeList,
    };
    const cacheKey = JSON.stringify(payload);
    const cachedContext = getFreshCachedValue(micromobilityContextCache, cacheKey);

    if (cachedContext) {
      startTransition(() => {
        setMobilityContext(cachedContext);
        setMobilityContextError(null);
      });
      return () => controller.abort();
    }

    void fetch("/api/micromobility/context", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Failed to load micromobility context.");
        }

        return response.json() as Promise<PlannerRouteMobilityContext>;
      })
      .then((payload) => {
        setCachedValue(micromobilityContextCache, cacheKey, payload);
        setMobilityContext(payload);
        setMobilityContextError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setMobilityContext(null);
        setMobilityContextError({
          routeId: activeRoute.id,
          message:
            error instanceof Error
              ? error.message
              : "Failed to load micromobility context.",
        });
      });

    return () => controller.abort();
  }, [
    activeRoute,
    activeRouteHasMicromobility,
    plan.placeList,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const runtimePlan = plan;

    async function loadScenarioRuntime() {
      const entries = await Promise.all(
        runtimePrefetchRoutes.map(async (route) => {
          const routePayload: PlannerRouteRequest = {
            route,
            placeList: runtimePlan.placeList,
          };
          const cacheKey = JSON.stringify(routePayload);
          const cachedIntel = getFreshCachedValue(routeIntelCache, cacheKey);
          const cachedSurface = getFreshCachedValue(routeSurfaceCache, cacheKey);
          const intelPromise = cachedIntel
            ? Promise.resolve(cachedIntel)
            : fetch("/api/mta/route-intel", {
                method: "POST",
                signal: controller.signal,
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(routePayload),
              }).then(async (response) => {
                if (!response.ok) {
                  throw new Error(`Failed to compute runtime summary for ${route.id}`);
                }

                const payload = (await response.json()) as PlannerRouteIntel;
                setCachedValue(routeIntelCache, cacheKey, payload);
                return payload;
              });
          const surfacePromise = cachedSurface
            ? Promise.resolve(cachedSurface)
            : fetch("/api/map/route-surface", {
                method: "POST",
                signal: controller.signal,
                cache: "no-store",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(routePayload),
              }).then(async (response) => {
                if (!response.ok) {
                  throw new Error(`Failed to compute runtime summary for ${route.id}`);
                }

                const payload = (await response.json()) as PlannerRouteSurfaceGeometry;
                setCachedValue(routeSurfaceCache, cacheKey, payload);
                return payload;
              });
          const [intel, surface] = await Promise.all([intelPromise, surfacePromise]);
          const summary = buildRouteRuntimeSummary(route, intel.transitLegs, surface.legs);

          return [
            route.id,
            {
              totalMin: summary.totalMin,
              legDurations: summary.legDurations,
              transitLegs: intel.transitLegs,
              surfaceLegGeometries: surface.legs,
            },
          ] as const;
        }),
      );

      if (!controller.signal.aborted) {
        setRouteRuntimeState({
          planKey: currentPlanKey,
          entries: Object.fromEntries(entries),
        });
      }
    }

    void loadScenarioRuntime().catch(() => {
      if (!controller.signal.aborted) {
        setRouteRuntimeState({
          planKey: currentPlanKey,
          entries: {},
        });
      }
    });

    return () => controller.abort();
  }, [currentPlanKey, plan, runtimePrefetchRoutes]);

  function applyDemoExample(exampleId: string) {
    const example = demoExamples.find((entry) => entry.id === exampleId) ?? demoExamples[0];
    const nextOrigin = buildCustomLocationOption(example.origin);
    const nextDestination = buildCustomLocationOption(example.destination);

    startTransition(() => {
      setOriginSelection(nextOrigin);
      setDestinationSelection(nextDestination);
      setActiveRouteId("");
      setMessages((current) => [
        current[0],
        {
          id: `demo-${example.id}`,
          role: "assistant",
          content: example.preview,
        },
      ]);
    });
  }

  function handleAssistantQuestion(question: string) {
    const leastWalking = [...plan.rankedRoutes].sort(
      (left, right) => left.metrics.walkMin - right.metrics.walkMin,
    )[0];
    const fewestTransfers = [...plan.rankedRoutes].sort(
      (left, right) => left.metrics.transfers - right.metrics.transfers,
    )[0];
    const personalOption = plan.rankedRoutes.find(
      (route) => route.micromobilityMode === "personal",
    );

      let response = "";
    const activeRouteTimeSaved = getRouteTimeSaved(
      activeRoute,
      plan.transitOnlyRoute,
      routeRuntimeById,
    );

    switch (question) {
      case "Why is this route faster?":
        response = `This route saves ${activeRouteTimeSaved} minutes versus Transit + Walk because it ${activeRoute.unlock.toLowerCase()}.`;
        break;
      case "Can I do this without a rental?":
        response = personalOption
          ? `Yes. The strongest bring-your-own option here lands in ${personalOption.metrics.totalMin} minutes and parking stays straightforward: ${personalOption.parking}.`
          : "This scenario's strongest mixed-mode option currently depends on shared micromobility. The Transit + Walk route is still available if you want to avoid rentals.";
        break;
      case "Show me the least walking option.":
        response = `The least-walking option keeps walking to ${leastWalking.metrics.walkMin} minutes. ${leastWalking.unlock}.`;
        break;
      case "Which route has the fewest transfers?":
        response = `The fewest-transfer option has a transfer count of ${fewestTransfers.metrics.transfers}. ${fewestTransfers.unlock}.`;
        break;
      case "Where do I park or dock at the end?":
        response = routeAccessSummary
          ? `This route: ${routeAccessSummary}`
          : `This route: ${activeRoute.parking}. Availability signal: ${activeRoute.availability}.`;
        break;
      default:
        response = `This route saves ${activeRouteTimeSaved} minutes versus Transit + Walk.`;
    }

    setMessages((current) => [
      ...current,
      { id: `user-${current.length}`, role: "user", content: question },
      {
        id: `assistant-${current.length + 1}`,
        role: "assistant",
        content: response,
      },
    ]);
  }

  function updateSelections(
    nextOrigin: LocationSearchOption,
    nextDestination: LocationSearchOption,
  ) {
    startTransition(() => {
      setOriginSelection(nextOrigin);
      setDestinationSelection(nextDestination);
      setActiveRouteId("");
    });
  }

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-4 sm:py-4">
      <div className="mx-auto max-w-[1500px]">
        <div className="app-shell grid min-h-[760px] gap-3 overflow-hidden rounded-[2rem] p-3 sm:h-[calc(100svh-2rem)] sm:grid-cols-1 sm:p-4 lg:grid-cols-[430px_minmax(0,1fr)] lg:gap-4">
          <aside className="overlay-surface flex min-h-0 flex-col rounded-[1.75rem] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <RouteIcon className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-medium tracking-[-0.04em] text-[var(--text)]">
                  FastTrack NYC
                </h1>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="trip-setup-compact rounded-[1.15rem] border border-[var(--border-soft)] px-2.5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-soft)]">
                    Trip
                  </p>
                  {plan.resolvedByNearestScenario ? (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                      Closest demo corridor
                    </span>
                  ) : null}
                </div>

                <div className="mt-2.5 grid gap-1.5">
                  <LocationAutocompleteField
                    label="Origin"
                    icon={<MapPin className="size-4" />}
                    selectedOption={originSelection}
                    demoOptions={demoOriginOptions}
                    onSelect={(option) => updateSelections(option, destinationSelection)}
                  />

                  <div className="flex items-center justify-center py-0.5 text-[var(--text-soft)]">
                    <ArrowDown className="size-3.5" />
                  </div>

                  <LocationAutocompleteField
                    label="Destination"
                    icon={<Flag className="size-4" />}
                    selectedOption={destinationSelection}
                    demoOptions={demoDestinationOptions}
                    onSelect={(option) => updateSelections(originSelection, option)}
                  />
                </div>

                {plan.resolvedByNearestScenario ? (
                  <p className="mt-2 text-[11px] leading-5 text-[var(--text-muted)]">
                    Using your typed places with the nearest supported FastTrack route.
                  </p>
                ) : null}
                {planLoading ? (
                  <p className="mt-2 text-[11px] leading-5 text-[var(--text-soft)]">
                    Updating routes...
                  </p>
                ) : null}
                {planError ? (
                  <p className="mt-2 text-[11px] leading-5 text-[var(--walk)]">{planError}</p>
                ) : null}
              </div>

              <div className="planner-glow rounded-[1.35rem] border border-[var(--border-soft)] px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-soft)]">
                  Trip style
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {modeOptions.map((option) => {
                    const isSelected = preferences.tripMode === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setPreferences((current) => ({
                            ...current,
                            tripMode: option.id,
                          }))
                        }
                        className={`rounded-full px-3 py-1.5 text-sm transition ${
                          isSelected
                            ? "bg-[var(--accent)] text-white"
                            : "route-pill text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                        }`}
                      >
                        {option.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="hide-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {isPlannerRefreshing ? (
                <div className="flex min-h-full items-center justify-center rounded-[1.45rem] border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-8">
                  <div className="flex max-w-[280px] flex-col items-center text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                      <LoaderCircle className="size-5 animate-spin" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-[var(--text)]">
                      Regenerating route
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                      Updating the fastest options for your selected transit mode.
                    </p>
                  </div>
                </div>
              ) : (
                <>
              <div className="rounded-[1.45rem] bg-[var(--accent-soft)] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-soft)]">
                      Recommended route
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {originSelection.label} to {destinationSelection.label}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                        {getRouteSavingsCopy(
                          activeRoute,
                          plan.transitOnlyRoute,
                          plan.rankedRoutes,
                          routeRuntimeById,
                          preferences.tripMode,
                        )}
                      </p>
                    </div>
                    <p className="metric-mono text-3xl font-medium tracking-[-0.05em] text-[var(--text)]">
                      {activeRouteDisplayedTotalMin}
                      <span className="ml-1 text-base text-[var(--text-muted)]">min</span>
                    </p>
                  </div>

                  <div className="mt-4 rounded-[1.2rem] bg-white/75 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">
                        Route flow
                      </p>
                      {activeRouteHasUsableLiveDeparture ? (
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-soft)]">
                          Live
                        </p>
                      ) : null}
                    </div>
                    <RouteTimeline
                      legs={activeRoute.legs}
                      legDurations={Object.fromEntries(
                        activeRoute.legs.map((leg) => [leg.id, getDisplayedLegDuration(leg)]),
                      )}
                      transitLegs={liveIntel?.transitLegs ?? []}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatPill
                      icon={<RouteIcon className="size-3.5" />}
                      label="Transfers"
                      value={String(displayedTransferCount)}
                    />
                    <StatPill
                      icon={<Waves className="size-3.5" />}
                      label="Cost"
                      value={formatMoney(activeRoute.metrics.costUsd)}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[1.45rem] border border-[var(--border-soft)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">
                      Current route
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                      {computedTransitSummary}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-full bg-[var(--accent)] px-4 text-white hover:bg-[var(--accent)]/90"
                    onClick={() => setAssistantOpen(true)}
                  >
                    <Sparkles className="mr-1 size-4" />
                    Explain
                  </Button>
                </div>

                {activeRouteHasTransit ? (
                  <div className="mt-4 rounded-[1.2rem] bg-[var(--surface-muted)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-[var(--text)]">Live MTA</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {liveIntelStatus === "loading"
                          ? "Loading"
                          : primaryTransitIntel?.status === "ok"
                            ? "Realtime"
                            : "Limited"}
                      </p>
                    </div>

                    {liveIntelStatus === "loading" ? (
                      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                        <LoaderCircle className="size-4 animate-spin" />
                        Loading
                      </div>
                    ) : liveIntelStatus === "error" ? (
                      <div className="mt-3 flex items-start gap-2 text-sm text-[var(--text-muted)]">
                        <AlertTriangle className="mt-0.5 size-4 text-[var(--walk)]" />
                        <p>{liveIntelError?.message}</p>
                      </div>
                    ) : activeTransitLegRuntimeDetails.length > 0 ? (
                      <div className="mt-3 space-y-3">
                      {activeTransitLegRuntimeDetails.map((legDetail, index) => (
                        <div
                          key={legDetail.leg.id}
                          className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5"
                        >
                          {(() => {
                            const relevantDepartures = getRelevantDeparturesForLeg(
                              legDetail.transitLeg,
                              legDetail.arrivalAtLegMin,
                            );

                            return (
                              <>
                          {legDetail.transitLeg.lines.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {legDetail.transitLeg.lines.map((line) => (
                                <span
                                  key={line.id}
                                  className="rounded-full px-2.5 py-1 text-xs font-semibold"
                                  style={{
                                    backgroundColor: line.color,
                                    color: line.textColor,
                                  }}
                                >
                                  {line.shortName}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-2 flex flex-wrap gap-2">
                            <StatPill
                              icon={<TrainFront className="size-3.5" />}
                              label={index === 0 ? "Wait to board" : "Wait after transfer"}
                              value={
                                legDetail.hasPlausibleWait
                                  ? formatCompactMinutes(legDetail.waitMin)
                                  : legDetail.transitLeg.departureInMin !== undefined
                                    ? "Later"
                                    : "TBD"
                              }
                            />
                            <StatPill
                              icon={<Clock3 className="size-3.5" />}
                              label="Ride"
                              value={formatCompactMinutes(legDetail.rideMin)}
                            />
                            {legDetail.transitLeg.departureInMin !== undefined &&
                            !legDetail.hasPlausibleWait ? (
                              <StatPill
                                icon={<Clock3 className="size-3.5" />}
                                label="Next departs"
                                value={formatDepartureValue(legDetail.transitLeg.departureInMin)}
                              />
                            ) : null}
                          </div>

                          {legDetail.transitLeg.fromStation && legDetail.transitLeg.toStation ? (
                            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                              {legDetail.transitLeg.fromStation.name} to{" "}
                              {legDetail.transitLeg.toStation.name}
                            </p>
                          ) : null}

                          {legDetail.transitLeg.departureInMin === undefined ? (
                            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                              No scheduled departure is available for this leg right now.
                            </p>
                          ) : !legDetail.hasPlausibleWait ? (
                            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                              No near-term departures for this leg right now.
                            </p>
                          ) : null}

                          {relevantDepartures.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {relevantDepartures.slice(0, 3).map((departure) => (
                                <div
                                  key={departure.tripId}
                                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1 text-[11px] text-[var(--text-muted)]"
                                >
                                  <TrainLineBadge
                                    routeId={departure.routeId}
                                    lines={legDetail.transitLeg.lines}
                                  />
                                  <span>in {formatDepartureValue(departure.departureInMin)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {legDetail.transitLeg.alerts[0] ? (
                            <div className="mt-2 rounded-[0.95rem] border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
                              <p className="text-xs font-medium text-[var(--text)]">
                                {legDetail.transitLeg.alerts[0].header}
                              </p>
                              {legDetail.transitLeg.alerts[0].description ? (
                                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                                  {legDetail.transitLeg.alerts[0].description}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          {legDetail.transitLeg.status !== "ok" ? (
                            <div className="mt-2 flex items-start gap-2 text-sm text-[var(--text-muted)]">
                              <AlertTriangle className="mt-0.5 size-4 text-[var(--walk)]" />
                              <p>
                                {legDetail.transitLeg.reason ??
                                  "Realtime data is not available for this transit leg yet."}
                              </p>
                            </div>
                          ) : null}
                              </>
                            );
                          })()}
                        </div>
                      ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-[var(--text-muted)]">
                        Live MTA signals are not available for this route yet.
                      </div>
                    )}
                  </div>
                ) : null}

                {activeRouteHasMicromobility ? (
                  <div className="mt-3 rounded-[1.2rem] bg-[var(--surface-muted)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-[var(--text)]">
                        Micromobility
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {mobilityContextStatus === "loading"
                          ? "Loading"
                          : mobilityContextStatus === "ready"
                            ? "Live"
                            : "Fallback"}
                      </p>
                    </div>

                    {mobilityContextStatus === "loading" ? (
                      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                        <LoaderCircle className="size-4 animate-spin" />
                        Loading
                      </div>
                    ) : mobilityContextStatus === "error" ? (
                      <div className="mt-3 flex items-start gap-2 text-sm text-[var(--text-muted)]">
                        <AlertTriangle className="mt-0.5 size-4 text-[var(--walk)]" />
                        <p>{mobilityContextError?.message ?? activeRoute.parking}</p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {recommendedPickupStation ? (
                          <div
                            className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5"
                            title={formatSharedStationTitle(recommendedPickupStation)}
                          >
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-soft)]">
                              Citi Bike Pickup
                            </p>
                            <p className="mt-1 text-sm font-medium text-[var(--text)]">
                              {recommendedPickupStation.name}
                            </p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              {formatSharedStationSummary(recommendedPickupStation)}
                            </p>
                          </div>
                        ) : null}

                        {recommendedDropoffStation ? (
                          <div
                            className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5"
                            title={formatSharedStationTitle(recommendedDropoffStation)}
                          >
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-soft)]">
                              Citi Bike Return
                            </p>
                            <p className="mt-1 text-sm font-medium text-[var(--text)]">
                              {recommendedDropoffStation.name}
                            </p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              {formatSharedStationSummary(recommendedDropoffStation)}
                            </p>
                          </div>
                        ) : null}

                        {recommendedParkingSpot ? (
                          <div className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5">
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-soft)]">
                              Parking
                            </p>
                            <p className="mt-1 text-sm font-medium text-[var(--text)]">
                              {recommendedParkingSpot.name}
                            </p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                              {recommendedParkingSpot.rackType} |{" "}
                              {formatMetersAsWalkTime(recommendedParkingSpot.distanceMeters)}
                            </p>
                          </div>
                        ) : null}

                        {!recommendedPickupStation &&
                        !recommendedDropoffStation &&
                        !recommendedParkingSpot ? (
                          <p className="text-sm text-[var(--text-muted)]">
                            {activeRoute.parking}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-[var(--border-soft)] bg-white text-[var(--text)]"
                    onClick={() => setActiveRouteId(plan.transitOnlyRoute.id)}
                  >
                    Transit + Walk
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-[1.45rem] border border-[var(--border-soft)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Other options</p>
                  </div>
                  <span className="metric-mono text-sm text-[var(--text-soft)]">
                    {suggestedRoutes.length} suggestion
                    {suggestedRoutes.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {suggestedRoutes.length > 0 ? (
                    suggestedRoutes.map((route) => (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => setActiveRouteId(route.id)}
                        className="w-full rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-3 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <RouteTimeline
                              legs={route.legs}
                              legDurations={routeRuntimeById[route.id]?.legDurations}
                              transitLegs={routeRuntimeById[route.id]?.transitLegs}
                              compact
                            />
                          </div>
                          <div className="text-right">
                            <p className="metric-mono text-base text-[var(--text)]">
                              {routeRuntimeById[route.id]?.totalMin ?? route.metrics.totalMin}m
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      No other routes match this micromobility mode yet.
                    </p>
                  )}
                </div>
              </div>
                </>
              )}
            </div>
          </aside>

          <section className="relative min-h-[420px] overflow-hidden rounded-[1.75rem] lg:min-h-0">
            {isPlannerRefreshing ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(247,250,252,0.98),rgba(238,244,249,0.98))]">
                <div className="rounded-[1.4rem] border border-[var(--border-soft)] bg-white/92 px-5 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                      <LoaderCircle className="size-4.5 animate-spin" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">
                        Regenerating route
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                        Updating map and route details
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <MapStage
                plan={plan}
                activeRoute={activeRoute}
                transitLegs={liveIntel?.transitLegs}
                transitIntelStatus={liveIntelStatus}
                surfaceLegGeometries={surfaceGeometry?.legs}
                surfaceGeometryStatus={surfaceGeometryStatus}
              mobilityContext={
                mobilityContext?.routeId === activeRoute.id ? mobilityContext : undefined
              }
              mobilityContextStatus={mobilityContextStatus}
              activeRouteTotalMin={activeRouteDisplayedTotalMin}
              alternateRoutes={alternateRouteOverlays}
              onRouteSelect={setActiveRouteId}
              className="h-full min-h-[420px]"
            />
            )}
          </section>
        </div>
      </div>

      {!demoStoriesDismissed ? (
        <div className="pointer-events-none fixed bottom-5 right-5 z-30 max-w-[340px]">
          <div className="pointer-events-auto rounded-[1.4rem] border border-[var(--border-soft)] bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  FastTrack NYC Demo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDemoStoriesDismissed(true)}
                className="rounded-full p-1 text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                aria-label="Dismiss demo stories"
              >
                <X className="size-4" />
              </button>
            </div>

            {!demoStoriesOpen ? (
              <div className="mt-3">
                <Button
                  size="sm"
                  className="rounded-full bg-[var(--accent)] px-4 text-white hover:bg-[var(--accent)]/90"
                  onClick={() => setDemoStoriesOpen(true)}
                >
                  Explore examples
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {demoExamples.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    onClick={() => applyDemoExample(example.id)}
                    className={`w-full rounded-[1rem] border px-3 py-2.5 text-left transition ${
                      originSelection.id === example.origin.id &&
                      destinationSelection.id === example.destination.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border-soft)] bg-white hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                    }`}
                    >
                    <p className="text-sm font-medium text-[var(--text)]">
                      {example.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                      {example.preview}
                    </p>
                  </button>
                ))}

                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-[var(--border-soft)] bg-white text-[var(--text)]"
                    onClick={() => setDemoStoriesOpen(false)}
                  >
                    Collapse
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <Sheet open={assistantOpen} onOpenChange={setAssistantOpen}>
        <SheetContent
          side="bottom"
          showCloseButton
          className="mx-auto flex h-auto max-h-[82svh] max-w-4xl flex-col overflow-hidden rounded-t-[1.75rem] border-[var(--border-soft)] bg-[var(--surface)] px-0 pb-0"
        >
          <SheetHeader className="border-b border-[var(--border-soft)] px-5 py-4">
            <SheetTitle className="text-xl tracking-[-0.03em] text-[var(--text)]">
              Explain this route
            </SheetTitle>
            <SheetDescription className="text-[var(--text-muted)]">
              {formatRouteBreakdown(activeRoute)} | {getRouteSavingsCopy(
                activeRoute,
                plan.transitOnlyRoute,
                plan.rankedRoutes,
                routeRuntimeById,
                preferences.tripMode,
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="grid gap-5 pb-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {messages.slice(-5).map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`rounded-[1.4rem] px-4 py-4 text-sm leading-6 ${
                      message.role === "assistant"
                        ? "bg-[var(--surface-muted)] text-[var(--text-muted)]"
                        : "ml-auto max-w-[92%] bg-[var(--accent-soft)] text-[var(--text)]"
                    }`}
                  >
                    {message.content}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="space-y-3">
              <div className="rounded-[1.4rem] bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-medium text-[var(--text)]">Quick questions</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {assistantQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => handleAssistantQuestion(question)}
                      className="rounded-full border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.4rem] bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-medium text-[var(--text)]">Current route signals</p>
                <div className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
                  <p>
                    Parking / docking: {routeAccessSummary || activeRoute.parking}
                  </p>
                  <p>Availability: {activeRoute.availability}</p>
                  <p>Comfort: {activeRoute.comfort}</p>
                </div>
              </div>
            </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function buildDemoLocationOption(placeId: string): LocationSearchOption {
  const place = createTripLocationFromPlace(placeId);

  return {
    id: place.id,
    label: place.name,
    subtitle: `${place.fullAddress}, NYC demo corridor`,
    lat: place.lat,
    lng: place.lng,
    source: "demo",
    anchorPlaceId: place.id,
  };
}

function buildDefaultAddressOption(): LocationSearchOption {
  return {
    id: "default-28-west-23rd",
    label: "28 W 23rd St",
    subtitle: "28 West 23rd Street, New York, NY 10010",
    lat: 40.74165,
    lng: -73.99259,
    source: "mapbox",
    anchorPlaceId: "flatiron",
  };
}

function buildCustomLocationOption(
  selection: Omit<LocationSearchOption, "source">,
): LocationSearchOption {
  return {
    ...selection,
    source: "demo",
  };
}

function toTripLocation(selection: LocationSearchOption): TripLocation {
  return {
    id: selection.anchorPlaceId ?? selection.id,
    name: selection.label,
    fullAddress: selection.subtitle ?? selection.label,
    lat: selection.lat,
    lng: selection.lng,
  };
}

function routeHasTransit(route: PlannerPlan["recommendedRoute"]) {
  return route.legs.some((leg) => leg.mode === "transit" || leg.mode === "bus");
}

function routeHasPersonalMicromobility(route: PlannerPlan["recommendedRoute"]) {
  return route.legs.some((leg) => leg.mode === "personal_micromobility");
}

function routeMatchesTripMode(
  route: PlannerPlan["recommendedRoute"],
  tripMode: PlannerPreferences["tripMode"],
) {
  if (tripMode === "fastest") {
    return !route.legs.some((leg) => leg.mode === "shared_micromobility");
  }

  if (tripMode === "mixed") {
    return routeHasTransit(route) && routeHasPersonalMicromobility(route);
  }

  if (tripMode === "transit") {
    return route.isTransitOnly;
  }

  if (tripMode === "bike_walk") {
    return !routeHasTransit(route);
  }

  return false;
}

function getDefaultActiveRoute(
  rankedRoutes: PlannerPlan["rankedRoutes"],
  transitOnlyRoute: PlannerPlan["transitOnlyRoute"],
  tripMode: PlannerPreferences["tripMode"],
) {
  const fastestRoute = rankedRoutes[0];

  if (!fastestRoute) {
    return transitOnlyRoute;
  }

  const matchingRoute = rankedRoutes.find((route) => routeMatchesTripMode(route, tripMode));
  return matchingRoute ?? fastestRoute;
}

function StatPill({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1.5">
      <span className="text-[var(--text-soft)]">{icon}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-soft)]">
        {label}
      </span>
      <span className="metric-mono text-sm font-medium text-[var(--text)]">{value}</span>
    </div>
  );
}

function RouteTimeline({
  legs,
  legDurations,
  transitLegs,
  compact = false,
}: {
  legs: RouteLeg[];
  legDurations?: Record<string, number>;
  transitLegs?: PlannerRouteIntel["transitLegs"];
  compact?: boolean;
}) {
  const totalDuration = legs.reduce(
    (sum, leg) => sum + (legDurations?.[leg.id] ?? leg.durationMin),
    0,
  );

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <div
        className={`flex overflow-hidden rounded-full bg-[var(--surface-muted)]/70 ${
          compact ? "h-1.5" : "h-2"
        }`}
      >
        {legs.map((leg) => {
          const duration = legDurations?.[leg.id] ?? leg.durationMin;
          const width = `${(duration / totalDuration) * 100}%`;

          return (
            <div
              key={leg.id}
              style={{ width }}
              className={
                leg.mode === "transit"
                  ? "bg-[var(--transit)]"
                  : leg.mode === "bus"
                    ? "bg-[var(--bus)]"
                    : leg.mode === "walk"
                      ? "bg-[var(--walk)]"
                      : "bg-[var(--micro)]"
              }
            />
          );
        })}
      </div>

      <div className={`flex flex-wrap ${compact ? "mt-2 gap-1" : "mt-2.5 gap-1.5"}`}>
        {legs.map((leg) => {
          const duration = legDurations?.[leg.id] ?? leg.durationMin;
          const transitLeg = transitLegs?.find((entry) => entry.legId === leg.id);
          const transitLabel =
            transitLeg?.lines.length
              ? transitLeg.lines.map((line) => line.shortName).join("/")
              : leg.lineName ?? "Transit";
          const legLabel = getDisplayLegLabel(leg);

          return (
            <div
              key={leg.id}
              className={`flex items-center rounded-full ${
                compact ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-1.5 px-2.5 py-1 text-xs"
              } ${
                leg.mode === "transit"
                  ? "mode-transit"
                  : leg.mode === "bus"
                    ? "mode-bus"
                    : leg.mode === "walk"
                      ? "mode-walk"
                      : "mode-micro"
              }`}
            >
              {getLegIcon(leg)}
              <span>{duration} min</span>
              <span className="text-[var(--text-muted)]">
                {leg.mode === "transit" || leg.mode === "bus" ? transitLabel : legLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getLegIcon(leg: RouteLeg) {
  if (leg.mode === "transit") {
    return <TrainFront className="size-4" />;
  }

  if (leg.mode === "bus") {
    return <Bus className="size-4" />;
  }

  if (leg.mode === "walk") {
    return <Footprints className="size-4" />;
  }

  return <Bike className="size-4" />;
}

function getDisplayLegLabel(leg: RouteLeg) {
  if (leg.mode === "shared_micromobility") {
    return "Citi Bike";
  }

  if (leg.mode === "personal_micromobility") {
    return "Ride";
  }

  return leg.label;
}

function formatCompactMinutes(value: number) {
  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function formatDepartureValue(value: number) {
  return value <= MAX_LIVE_WAIT_MIN ? formatCompactMinutes(value) : "Later";
}

function hasUsableLiveDeparture(
  transitLeg: PlannerRouteIntel["transitLegs"][number] | null | undefined,
) {
  return (
    transitLeg?.status === "ok" &&
    transitLeg.departureInMin !== undefined &&
    transitLeg.departureInMin <= MAX_LIVE_WAIT_MIN
  );
}

function hasKnownDeparture(
  transitLeg: PlannerRouteIntel["transitLegs"][number] | null | undefined,
) {
  return transitLeg?.status === "ok" && transitLeg.departureInMin !== undefined;
}

function getPlausibleTransitWaitMin(
  transitLeg: PlannerRouteIntel["transitLegs"][number] | null | undefined,
  elapsedMin: number,
) {
  const departureInMin = transitLeg?.departureInMin;

  if (!hasKnownDeparture(transitLeg) || departureInMin === undefined) {
    return undefined;
  }

  const waitMin = Math.max(0, departureInMin - elapsedMin);
  return waitMin <= MAX_RUNTIME_WAIT_MIN ? waitMin : undefined;
}

function getTransitLegDuration(
  leg: RouteLeg,
  transitIntelByLegId: Map<string, PlannerRouteIntel["transitLegs"][number]>,
  surfaceDurationByLegId: Map<string, number>,
) {
  if (leg.mode === "transit") {
    return (
      transitIntelByLegId.get(leg.id)?.travelMin ??
      surfaceDurationByLegId.get(leg.id) ??
      leg.durationMin
    );
  }

  return surfaceDurationByLegId.get(leg.id) ?? leg.durationMin;
}

function buildRouteRuntimeSummary(
  route: PlannerPlan["recommendedRoute"],
  transitLegs: PlannerRouteIntel["transitLegs"],
  surfaceLegGeometries: PlannerRouteSurfaceGeometry["legs"],
): RouteRuntimeSummary {
  const transitIntelByLegId = new Map(
    transitLegs.map((transitLeg) => [transitLeg.legId, transitLeg]),
  );
  const surfaceDurationByLegId = new Map(
    surfaceLegGeometries.map((leg) => [leg.legId, leg.durationMin]),
  );
  const legDurations = Object.fromEntries(
    route.legs.map((leg) => [
      leg.id,
      getTransitLegDuration(leg, transitIntelByLegId, surfaceDurationByLegId),
    ]),
  );
  let elapsedMin = 0;
  let fellBackToPlannedTiming = false;

  for (const leg of route.legs) {
    const duration = legDurations[leg.id] ?? leg.durationMin;

    if (leg.mode === "transit") {
      const transitLeg = transitIntelByLegId.get(leg.id);
      const waitMin = getPlausibleTransitWaitMin(transitLeg, elapsedMin);

      if (waitMin !== undefined) {
        elapsedMin += waitMin;
      } else if (hasKnownDeparture(transitLeg)) {
        fellBackToPlannedTiming = true;
      }
    }

    elapsedMin += duration;
  }

  return {
    totalMin: fellBackToPlannedTiming
      ? Math.max(elapsedMin, route.metrics.totalMin)
      : elapsedMin,
    legDurations,
    transitLegs,
    surfaceLegGeometries,
  };
}

function buildTransitLegRuntimeDetails(
  route: PlannerPlan["recommendedRoute"],
  transitLegs: PlannerRouteIntel["transitLegs"],
  surfaceLegGeometries: PlannerRouteSurfaceGeometry["legs"],
) {
  const transitIntelByLegId = new Map(
    transitLegs.map((transitLeg) => [transitLeg.legId, transitLeg]),
  );
  const surfaceDurationByLegId = new Map(
    surfaceLegGeometries.map((leg) => [leg.legId, leg.durationMin]),
  );
  const details: Array<{
    leg: RouteLeg;
    transitLeg: PlannerRouteIntel["transitLegs"][number];
    arrivalAtLegMin: number;
    waitMin: number;
    rideMin: number;
    hasPlausibleWait: boolean;
  }> = [];
  let elapsedMin = 0;

  for (const leg of route.legs) {
    const duration = getTransitLegDuration(leg, transitIntelByLegId, surfaceDurationByLegId);

    if (leg.mode !== "transit") {
      elapsedMin += duration;
      continue;
    }

    const transitLeg = transitIntelByLegId.get(leg.id);

    if (!transitLeg) {
      elapsedMin += duration;
      continue;
    }

    const arrivalAtLegMin = elapsedMin;
    const plausibleWaitMin = getPlausibleTransitWaitMin(transitLeg, elapsedMin);
    const boardAtMin =
      plausibleWaitMin !== undefined ? elapsedMin + plausibleWaitMin : elapsedMin;
    const waitMin = plausibleWaitMin ?? 0;

    details.push({
      leg,
      transitLeg,
      arrivalAtLegMin,
      waitMin,
      rideMin: duration,
      hasPlausibleWait: plausibleWaitMin !== undefined,
    });

    elapsedMin = boardAtMin + duration;
  }

  return details;
}

function getRelevantDeparturesForLeg(
  transitLeg: PlannerRouteIntel["transitLegs"][number],
  arrivalAtLegMin: number,
) {
  return transitLeg.departures.filter((departure) => {
    const waitMin = Math.max(0, departure.departureInMin - arrivalAtLegMin);
    return waitMin <= MAX_RUNTIME_WAIT_MIN;
  });
}

function getRouteTimeSaved(
  route: PlannerPlan["recommendedRoute"],
  transitOnlyRoute: PlannerPlan["transitOnlyRoute"],
  routeRuntimeById: Record<string, RouteRuntimeSummary>,
) {
  if (route.isTransitOnly) {
    return 0;
  }

  const baselineTotal =
    routeRuntimeById[transitOnlyRoute.id]?.totalMin ?? transitOnlyRoute.metrics.totalMin;
  const routeTotal = routeRuntimeById[route.id]?.totalMin ?? route.metrics.totalMin;

  return Math.max(0, baselineTotal - routeTotal);
}

function getRouteSavingsCopy(
  route: PlannerPlan["recommendedRoute"],
  transitOnlyRoute: PlannerPlan["transitOnlyRoute"],
  rankedRoutes: PlannerPlan["rankedRoutes"],
  routeRuntimeById: Record<string, RouteRuntimeSummary>,
  tripMode?: PlannerPreferences["tripMode"],
) {
  if (tripMode === "bike_walk") {
    const bikeWalkRoutes = rankedRoutes.filter((candidate) => !routeHasTransit(candidate));
    const fastestBikeWalkRoute = bikeWalkRoutes.sort((left, right) => {
      const leftTotal = routeRuntimeById[left.id]?.totalMin ?? left.metrics.totalMin;
      const rightTotal = routeRuntimeById[right.id]?.totalMin ?? right.metrics.totalMin;

      return leftTotal - rightTotal;
    })[0];

    if (!fastestBikeWalkRoute) {
      return "Bike/Walk timing unavailable.";
    }

    const routeTotal = routeRuntimeById[route.id]?.totalMin ?? route.metrics.totalMin;
    const fastestTotal =
      routeRuntimeById[fastestBikeWalkRoute.id]?.totalMin ??
      fastestBikeWalkRoute.metrics.totalMin;
    const deltaMin = Math.max(0, routeTotal - fastestTotal);

    if (deltaMin === 0) {
      return "Fastest Bike/Walk option.";
    }

    return `${deltaMin} min slower than the fastest Bike/Walk option.`;
  }

  if (route.isTransitOnly) {
    const fastestMixedModeRoute = rankedRoutes
      .filter((candidate) => !candidate.isTransitOnly)
      .sort((left, right) => {
        const leftTotal = routeRuntimeById[left.id]?.totalMin ?? left.metrics.totalMin;
        const rightTotal = routeRuntimeById[right.id]?.totalMin ?? right.metrics.totalMin;

        return leftTotal - rightTotal;
      })[0];

    if (!fastestMixedModeRoute) {
      return "Best non-micromobility option.";
    }

    const transitOnlyTotal =
      routeRuntimeById[route.id]?.totalMin ?? route.metrics.totalMin;
    const mixedModeTotal =
      routeRuntimeById[fastestMixedModeRoute.id]?.totalMin ??
      fastestMixedModeRoute.metrics.totalMin;
    const slowerBy = Math.max(0, transitOnlyTotal - mixedModeTotal);

    if (slowerBy > 0) {
      return `${slowerBy} min slower than the fastest mixed-mode route.`;
    }

    return "About the same time as the fastest mixed-mode route.";
  }

  const timeSaved = getRouteTimeSaved(route, transitOnlyRoute, routeRuntimeById);

  if (timeSaved > 0) {
    if (route.micromobilityMode === "personal") {
      return `Save ${timeSaved} min by taking your bike or scooter.`;
    }

    if (route.micromobilityMode === "shared") {
      return `Save ${timeSaved} min with Citi Bike.`;
    }

    return `Save ${timeSaved} min versus Transit + Walk.`;
  }

  return "About the same time as Transit + Walk.";
}

function formatRouteBreakdown(route: PlannerPlan["recommendedRoute"]) {
  return route.legs
    .map((leg) => {
      const duration = `${leg.durationMin} min`;

      if (leg.mode === "transit" || leg.mode === "bus") {
        return `${duration} ${leg.lineName ?? "transit"}`;
      }

      if (leg.mode === "shared_micromobility") {
        return `${duration} Citi Bike`;
      }

      return `${duration} ${leg.mode === "walk" ? "walk" : "ride"}`;
    })
    .join(" • ");
}

function TrainLineBadge({
  routeId,
  lines,
}: {
  routeId: string;
  lines: PlannerRouteIntel["transitLegs"][number]["lines"];
}) {
  const matchedLine =
    lines.find((line) => line.shortName === routeId || line.id === routeId) ?? lines[0];

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        backgroundColor: matchedLine?.color ?? "#245bdb",
        color: matchedLine?.textColor ?? "#ffffff",
      }}
    >
      {routeId}
    </span>
  );
}

function formatMetersAsWalkTime(distanceMeters: number) {
  const minutes = Math.max(1, Math.round(distanceMeters / 80));

  return `${minutes} min away`;
}

function formatSharedStationSummary(
  station: PlannerRouteMobilityContext["sharedStations"][number],
) {
  const parts =
    station.role === "pickup"
      ? [
          `${station.bikesAvailable} bikes available`,
          station.ebikesAvailable > 0 ? `${station.ebikesAvailable} e-bikes` : null,
          `${station.docksAvailable} docks open`,
          formatMetersAsWalkTime(station.distanceMeters),
        ]
      : [
          `${station.docksAvailable} docks open`,
          `${station.bikesAvailable} bikes at station`,
          station.ebikesAvailable > 0 ? `${station.ebikesAvailable} e-bikes` : null,
          formatMetersAsWalkTime(station.distanceMeters),
        ];

  return parts.filter(Boolean).join(" • ");
}

function formatSharedStationTitle(
  station: PlannerRouteMobilityContext["sharedStations"][number],
) {
  const action = station.role === "pickup" ? "Pick up a Citi Bike" : "Return your Citi Bike";

  return `${action} at ${station.name}. ${formatSharedStationSummary(station)}.`;
}

function buildRouteAccessSummary({
  activeRoute,
  pickupStation,
  dropoffStation,
  parkingSpot,
}: {
  activeRoute: ReturnType<typeof buildPlannerPlan>["recommendedRoute"];
  pickupStation?: PlannerRouteMobilityContext["sharedStations"][number];
  dropoffStation?: PlannerRouteMobilityContext["sharedStations"][number];
  parkingSpot?: PlannerRouteMobilityContext["parkingSpots"][number];
}) {
  if (pickupStation && dropoffStation) {
    return `Pick up at ${pickupStation.name} and dock at ${dropoffStation.name}.`;
  }

  if (pickupStation) {
    return `Pick up at ${pickupStation.name}. ${pickupStation.bikesAvailable} bikes are available now.`;
  }

  if (dropoffStation) {
    return `Dock at ${dropoffStation.name}. ${dropoffStation.docksAvailable} docks are open now.`;
  }

  if (parkingSpot) {
    const destinationLabel =
      parkingSpot.role === "destination" ? "destination" : "station";

    return `Leave your bike at ${parkingSpot.name} near the ${destinationLabel}.`;
  }

  return activeRoute.parking;
}

