"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Bike,
  Clock3,
  Footprints,
  LoaderCircle,
  Route as RouteIcon,
  Sparkles,
  TrainFront,
  Waves,
  X,
} from "lucide-react";
import { MapStage } from "@/components/map-stage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PlannerRouteSurfaceGeometry } from "@/lib/mapbox/types";
import { PlannerRouteIntel } from "@/lib/mta/types";
import {
  assistantQuestions,
  places,
  PlannerPreferences,
  RouteLeg,
  scenarios,
} from "@/lib/fasttrack-data";
import {
  buildPlannerPlan,
  describeRouteDelta,
  formatMoney,
  getDestinationsForOrigin,
  getPlaceById,
} from "@/lib/fasttrack-routing";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type RouteRuntimeSummary = {
  totalMin: number;
};

const modeOptions: {
  id: PlannerPreferences["micromobilityMode"];
  shortLabel: string;
}[] = [
  { id: "any", shortLabel: "Any" },
  { id: "personal", shortLabel: "Personal" },
  { id: "shared", shortLabel: "Shared" },
  { id: "avoid", shortLabel: "Transit only" },
];

export function FastTrackApp() {
  const [originId, setOriginId] = useState(scenarios[0].originId);
  const [destinationId, setDestinationId] = useState(scenarios[0].destinationId);
  const [preferences, setPreferences] = useState<PlannerPreferences>({
    goal: "fastest",
    micromobilityMode: "any",
  });
  const [activeRouteId, setActiveRouteId] = useState(scenarios[0].routes[1].id);
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
  const [routeRuntimeState, setRouteRuntimeState] = useState<{
    scenarioId: string;
    entries: Record<string, RouteRuntimeSummary>;
  }>({
    scenarioId: scenarios[0].id,
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

  const destinationOptions = getDestinationsForOrigin(originId);
  const currentDestinationIsValid = destinationOptions.some(
    (scenario) => scenario.destinationId === destinationId,
  );
  const resolvedDestinationId = currentDestinationIsValid
    ? destinationId
    : destinationOptions[0]?.destinationId ?? scenarios[0].destinationId;
  const plan = buildPlannerPlan(originId, resolvedDestinationId, preferences);
  const routeRuntimeById =
    routeRuntimeState.scenarioId === plan.scenario.id ? routeRuntimeState.entries : {};
  const runtimeSortedRoutes = [...plan.rankedRoutes].sort((left, right) => {
    const leftTotal = routeRuntimeById[left.id]?.totalMin ?? left.metrics.totalMin;
    const rightTotal = routeRuntimeById[right.id]?.totalMin ?? right.metrics.totalMin;

    return leftTotal - rightTotal;
  });
  const activeRoute =
    runtimeSortedRoutes.find((route) => route.id === activeRouteId) ??
    runtimeSortedRoutes[0] ??
    plan.recommendedRoute;
  const alternateRoutes = runtimeSortedRoutes.filter((route) => route.id !== activeRoute.id);
  const suggestedRoutes = alternateRoutes.slice(0, 3);
  const originPlace = getPlaceById(plan.scenario.originId, places);
  const destinationPlace = getPlaceById(plan.scenario.destinationId, places);
  const primaryTransitIntel = liveIntel?.transitLegs[0];
  const activeRouteHasTransit = activeRoute.legs.some((leg) => leg.mode === "transit");
  const activeTransitLegIndex = activeRoute.legs.findIndex((leg) => leg.mode === "transit");
  const activeSurfaceGeometryByLegId = new Map(
    (surfaceGeometry?.routeId === activeRoute.id ? surfaceGeometry.legs : []).map((leg) => [
      leg.legId,
      leg,
    ]),
  );
  const getDisplayedLegDuration = (leg: RouteLeg) =>
    activeSurfaceGeometryByLegId.get(leg.id)?.durationMin ?? leg.durationMin;
  const displayedWalkMinutes = activeRoute.legs.reduce(
    (total, leg) =>
      total + (leg.mode === "walk" ? getDisplayedLegDuration(leg) : 0),
    0,
  );
  const displayedMicromobilityMinutes = activeRoute.legs.reduce(
    (total, leg) =>
      total +
      (leg.mode === "personal_micromobility" || leg.mode === "shared_micromobility"
        ? getDisplayedLegDuration(leg)
        : 0),
    0,
  );
  const preTransitMinutes =
    activeTransitLegIndex >= 0
      ? activeRoute.legs
          .slice(0, activeTransitLegIndex)
          .reduce((total, leg) => total + getDisplayedLegDuration(leg), 0)
      : 0;
  const postTransitMinutes =
    activeTransitLegIndex >= 0
      ? activeRoute.legs
          .slice(activeTransitLegIndex + 1)
          .reduce((total, leg) => total + getDisplayedLegDuration(leg), 0)
      : activeRoute.legs.reduce((total, leg) => total + getDisplayedLegDuration(leg), 0);
  const liveTransitRideMin =
    primaryTransitIntel?.travelMin ??
    (activeTransitLegIndex >= 0 ? activeRoute.legs[activeTransitLegIndex]?.durationMin ?? 0 : 0);
  const activeRouteLiveTotalMin =
    primaryTransitIntel?.status === "ok" &&
    primaryTransitIntel.departureInMin !== undefined
      ? Math.max(preTransitMinutes, primaryTransitIntel.departureInMin) +
        liveTransitRideMin +
        postTransitMinutes
      : undefined;
  const activeRouteDisplayedTotalMin =
    activeRouteLiveTotalMin ??
    activeRoute.legs.reduce(
      (total, leg) =>
        total +
        (leg.mode === "transit" ? liveTransitRideMin : getDisplayedLegDuration(leg)),
      0,
    );
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

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/mta/route-intel?routeId=${activeRoute.id}`, {
      signal: controller.signal,
      cache: "no-store",
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
  }, [activeRoute.id]);

  useEffect(() => {
    if (!activeRouteHasStreetLegs) {
      return;
    }

    const controller = new AbortController();

    void fetch(`/api/map/route-surface?routeId=${activeRoute.id}`, {
      signal: controller.signal,
      cache: "no-store",
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
  }, [activeRoute.id, activeRouteHasStreetLegs]);

  useEffect(() => {
    const controller = new AbortController();
    const runtimePlan = buildPlannerPlan(originId, resolvedDestinationId, preferences);

    async function loadScenarioRuntime() {
      const entries = await Promise.all(
        runtimePlan.rankedRoutes.map(async (route) => {
          const [intelResponse, surfaceResponse] = await Promise.all([
            fetch(`/api/mta/route-intel?routeId=${route.id}`, {
              signal: controller.signal,
              cache: "no-store",
            }),
            fetch(`/api/map/route-surface?routeId=${route.id}`, {
              signal: controller.signal,
              cache: "no-store",
            }),
          ]);

          if (!intelResponse.ok || !surfaceResponse.ok) {
            throw new Error(`Failed to compute runtime summary for ${route.id}`);
          }

          const intel = (await intelResponse.json()) as PlannerRouteIntel;
          const surface = (await surfaceResponse.json()) as PlannerRouteSurfaceGeometry;
          const surfaceDurationByLegId = new Map(
            surface.legs.map((leg) => [leg.legId, leg.durationMin]),
          );
          const firstTransitLegIndex = route.legs.findIndex((leg) => leg.mode === "transit");
          const preTransitMinutes =
            firstTransitLegIndex >= 0
              ? route.legs
                  .slice(0, firstTransitLegIndex)
                  .reduce(
                    (total, leg) =>
                      total + (surfaceDurationByLegId.get(leg.id) ?? leg.durationMin),
                    0,
                  )
              : 0;
          const postTransitMinutes =
            firstTransitLegIndex >= 0
              ? route.legs
                  .slice(firstTransitLegIndex + 1)
                  .reduce(
                    (total, leg) =>
                      total + (surfaceDurationByLegId.get(leg.id) ?? leg.durationMin),
                    0,
                  )
              : route.legs.reduce(
                  (total, leg) =>
                    total + (surfaceDurationByLegId.get(leg.id) ?? leg.durationMin),
                  0,
                );
          const primaryTransit = intel.transitLegs[0];
          const totalMin =
            firstTransitLegIndex >= 0 && primaryTransit?.departureInMin !== undefined
              ? Math.max(preTransitMinutes, primaryTransit.departureInMin) +
                (primaryTransit.travelMin ?? route.legs[firstTransitLegIndex].durationMin) +
                postTransitMinutes
              : route.legs.reduce(
                  (total, leg) =>
                    total + (surfaceDurationByLegId.get(leg.id) ?? leg.durationMin),
                  0,
                );

          return [route.id, { totalMin }] as const;
        }),
      );

      if (!controller.signal.aborted) {
        setRouteRuntimeState({
          scenarioId: runtimePlan.scenario.id,
          entries: Object.fromEntries(entries),
        });
      }
    }

    void loadScenarioRuntime().catch(() => {
      if (!controller.signal.aborted) {
        setRouteRuntimeState({
          scenarioId: runtimePlan.scenario.id,
          entries: {},
        });
      }
    });

    return () => controller.abort();
  }, [originId, resolvedDestinationId, preferences]);

  function applyScenario(scenarioId: string) {
    const scenario = scenarios.find((entry) => entry.id === scenarioId) ?? scenarios[0];

    startTransition(() => {
      setOriginId(scenario.originId);
      setDestinationId(scenario.destinationId);
      setActiveRouteId(scenario.routes[1]?.id ?? scenario.routes[0].id);
      setDemoStoriesOpen(false);
      setMessages((current) => [
        current[0],
        {
          id: `scenario-${scenario.id}`,
          role: "assistant",
          content: `${scenario.heroMetric}. ${scenario.headline}`,
        },
      ]);
    });
  }

  function handleAssistantQuestion(question: string) {
    const baseline = plan.transitOnlyRoute;
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

    switch (question) {
      case "Why is this route faster?":
        response = `${activeRoute.name} is ${Math.max(activeRoute.timeSaved, 0)} minutes faster because it ${activeRoute.unlock.toLowerCase()}. The walking burden drops from ${baseline.metrics.walkMin} to ${activeRoute.metrics.walkMin} minutes.`;
        break;
      case "Can I do this without a rental?":
        response = personalOption
          ? `Yes. ${personalOption.name} is the strongest bring-your-own option here. It lands in ${personalOption.metrics.totalMin} minutes and parking stays straightforward: ${personalOption.parking}.`
          : "This scenario's strongest mixed-mode option currently depends on shared micromobility. The transit-only baseline is still available if you want to avoid rentals.";
        break;
      case "Show me the least walking option.":
        response = `${leastWalking.name} keeps walking to ${leastWalking.metrics.walkMin} minutes. ${leastWalking.unlock}.`;
        break;
      case "Which route has the fewest transfers?":
        response = `${fewestTransfers.name} has the lowest transfer count at ${fewestTransfers.metrics.transfers}. ${fewestTransfers.unlock}.`;
        break;
      case "Where do I park or dock at the end?":
        response = `${activeRoute.name}: ${activeRoute.parking}. Availability signal: ${activeRoute.availability}.`;
        break;
      default:
        response = `Micromobility saves ${Math.max(activeRoute.timeSaved, 0)} minutes here by changing how you enter the transit network.`;
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
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--text-soft)]">
                  FastTrack NYC
                </p>
                <h1 className="text-lg font-medium tracking-[-0.04em] text-[var(--text)]">
                  Mixed-mode trip planner
                </h1>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <PlannerField
                label="Origin"
                value={originId}
                onValueChange={(value) => {
                  const nextDestinations = getDestinationsForOrigin(value);

                  setOriginId(value);
                  setDestinationId(
                    nextDestinations[0]?.destinationId ?? scenarios[0].destinationId,
                  );
                }}
                options={Array.from(
                  new Set(scenarios.map((scenario) => scenario.originId)),
                ).map((value) => ({
                  value,
                  label: getPlaceById(value, places)?.name ?? value,
                }))}
              />

              <PlannerField
                label="Destination"
                value={resolvedDestinationId}
                onValueChange={setDestinationId}
                options={destinationOptions.map((scenario) => ({
                  value: scenario.destinationId,
                  label:
                    getPlaceById(scenario.destinationId, places)?.name ??
                    scenario.destinationId,
                }))}
              />

              <div className="planner-glow rounded-[1.35rem] border border-[var(--border-soft)] px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-soft)]">
                  Micromobility mode
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {modeOptions.map((option) => {
                    const isSelected = preferences.micromobilityMode === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setPreferences((current) => ({
                            ...current,
                            micromobilityMode: option.id,
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

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="rounded-[1.45rem] bg-[var(--accent-soft)] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-soft)]">
                      Recommended route
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {originPlace?.name} to {destinationPlace?.name}
                    </p>
                  </div>
                  <Badge className="rounded-full bg-white px-3 py-1 text-[var(--text-muted)] shadow-none">
                    {routeRuntimeById[activeRoute.id]
                      ? `${routeRuntimeById[activeRoute.id].totalMin} min live`
                      : plan.scenario.heroMetric}
                  </Badge>
                </div>

                <div className="mt-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xl font-medium tracking-[-0.04em] text-[var(--text)]">
                        {activeRoute.name}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                        {describeRouteDelta(activeRoute, plan.transitOnlyRoute)}
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
                      {activeRouteLiveTotalMin !== undefined ? (
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
                      icon={<Clock3 className="size-3.5" />}
                      label="Walk"
                      value={`${displayedWalkMinutes} min`}
                    />
                    {displayedMicromobilityMinutes > 0 ? (
                      <StatPill
                        icon={<Bike className="size-3.5" />}
                        label="Micro"
                        value={`${displayedMicromobilityMinutes} min`}
                      />
                    ) : null}
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
                  ) : primaryTransitIntel ? (
                    <div className="mt-3 space-y-3">
                      {primaryTransitIntel.lines.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {primaryTransitIntel.lines.map((line) => (
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

                      {primaryTransitIntel.status === "ok" ? (
                        <>
                          <div className="flex flex-wrap gap-2">
                            <StatPill
                              icon={<TrainFront className="size-3.5" />}
                              label="Next"
                              value={
                                primaryTransitIntel.departureInMin !== undefined
                                  ? formatCompactMinutes(primaryTransitIntel.departureInMin)
                                  : "No service"
                              }
                            />
                            <StatPill
                              icon={<Clock3 className="size-3.5" />}
                              label="Ride"
                              value={
                                primaryTransitIntel.travelMin !== undefined
                                  ? formatCompactMinutes(primaryTransitIntel.travelMin)
                                  : "TBD"
                              }
                            />
                          </div>

                          {primaryTransitIntel.fromStation &&
                          primaryTransitIntel.toStation ? (
                            <p className="text-sm leading-6 text-[var(--text-muted)]">
                              {primaryTransitIntel.fromStation.name} to{" "}
                              {primaryTransitIntel.toStation.name}
                            </p>
                          ) : null}

                          {primaryTransitIntel.departures.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {primaryTransitIntel.departures.slice(0, 3).map((departure) => (
                                <div
                                  key={departure.tripId}
                                  className="rounded-full border border-[var(--border-soft)] bg-white px-2.5 py-1 text-[11px] text-[var(--text-muted)]"
                                >
                                  {departure.routeId} {formatCompactMinutes(departure.departureInMin)}
                                  {departure.travelMin
                                    ? ` • ${formatCompactMinutes(departure.travelMin)} ride`
                                    : ""}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {primaryTransitIntel.alerts[0] ? (
                            <div className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5">
                              <p className="text-xs font-medium text-[var(--text)]">
                                {primaryTransitIntel.alerts[0].header}
                              </p>
                              {primaryTransitIntel.alerts[0].description ? (
                                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                                  {primaryTransitIntel.alerts[0].description}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                          <AlertTriangle className="mt-0.5 size-4 text-[var(--walk)]" />
                          <p>
                            {primaryTransitIntel.reason ??
                              "Realtime data is not available for this transit leg yet."}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : activeRouteHasTransit ? (
                    <div className="mt-3 text-sm text-[var(--text-muted)]">
                      Live MTA signals are not available for this route yet.
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-[var(--border-soft)] bg-white text-[var(--text)]"
                    onClick={() => setActiveRouteId(plan.transitOnlyRoute.id)}
                  >
                    Transit-only
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
                        className="w-full rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-[var(--text)]">
                              {route.name}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                              {describeRouteDelta(route, plan.transitOnlyRoute)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="metric-mono text-base text-[var(--text)]">
                              {routeRuntimeById[route.id]?.totalMin ?? route.metrics.totalMin}m
                            </p>
                            <p className="text-xs text-[var(--text-soft)]">
                              {route.bestFor}
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
            </div>
          </aside>

          <section className="min-h-[420px] overflow-hidden rounded-[1.75rem] lg:min-h-0">
            <MapStage
              plan={plan}
              activeRoute={activeRoute}
              transitLegs={liveIntel?.transitLegs}
              transitIntelStatus={liveIntelStatus}
              surfaceLegGeometries={surfaceGeometry?.legs}
              surfaceGeometryStatus={surfaceGeometryStatus}
              className="h-full min-h-[420px]"
            />
          </section>
        </div>
      </div>

      {!demoStoriesDismissed ? (
        <div className="pointer-events-none fixed bottom-5 right-5 z-30 max-w-[340px]">
          <div className="pointer-events-auto rounded-[1.4rem] border border-[var(--border-soft)] bg-white/95 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  FastTrack NYC examples
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  Check out some examples of how FastTrack NYC can save time on your
                  commute.
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
                {scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => applyScenario(scenario.id)}
                    className={`w-full rounded-[1rem] border px-3 py-2.5 text-left transition ${
                      scenario.id === plan.scenario.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border-soft)] bg-white hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    <p className="text-sm font-medium text-[var(--text)]">
                      {scenario.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                      {scenario.heroMetric}
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
          className="mx-auto h-auto max-h-[82svh] max-w-4xl rounded-t-[1.75rem] border-[var(--border-soft)] bg-[var(--surface)] px-0 pb-0"
        >
          <SheetHeader className="border-b border-[var(--border-soft)] px-5 py-4">
            <SheetTitle className="text-xl tracking-[-0.03em] text-[var(--text)]">
              Explain this route
            </SheetTitle>
            <SheetDescription className="text-[var(--text-muted)]">
              {activeRoute.name} | {describeRouteDelta(activeRoute, plan.transitOnlyRoute)}
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-5 overflow-y-auto px-5 py-5 lg:grid-cols-[1.1fr_0.9fr]">
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
                  <p>Parking / docking: {activeRoute.parking}</p>
                  <p>Availability: {activeRoute.availability}</p>
                  <p>Comfort: {activeRoute.comfort}</p>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function PlannerField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="planner-glow rounded-[1.35rem] border border-[var(--border-soft)] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-soft)]">
        {label}
      </p>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="mt-2 h-10 w-full rounded-xl border-0 bg-transparent px-0 text-left text-base font-medium text-[var(--text)] shadow-none focus-visible:ring-0">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent className="rounded-2xl border-[var(--border-soft)] bg-[var(--surface)]">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
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
}: {
  legs: RouteLeg[];
  legDurations?: Record<string, number>;
  transitLegs?: PlannerRouteIntel["transitLegs"];
}) {
  const totalDuration = legs.reduce(
    (sum, leg) => sum + (legDurations?.[leg.id] ?? leg.durationMin),
    0,
  );

  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]/70">
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
                  : leg.mode === "walk"
                    ? "bg-[var(--walk)]"
                    : "bg-[var(--micro)]"
              }
            />
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {legs.map((leg) => {
          const duration = legDurations?.[leg.id] ?? leg.durationMin;
          const transitLeg = transitLegs?.find((entry) => entry.legId === leg.id);
          const transitLabel =
            transitLeg?.lines.length
              ? transitLeg.lines.map((line) => line.shortName).join("/")
              : leg.lineName ?? "Transit";

          return (
            <div
              key={leg.id}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                leg.mode === "transit"
                  ? "mode-transit"
                  : leg.mode === "walk"
                    ? "mode-walk"
                    : "mode-micro"
              }`}
            >
              {getLegIcon(leg)}
              <span>{duration} min</span>
              <span className="text-[var(--text-muted)]">
                {leg.mode === "transit" ? transitLabel : leg.label}
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

  if (leg.mode === "walk") {
    return <Footprints className="size-4" />;
  }

  return <Bike className="size-4" />;
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
