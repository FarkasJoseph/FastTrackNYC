"use client";

import { startTransition, useState } from "react";
import { AssistantCard } from "@/components/assistant-card";
import { MapCard } from "@/components/map-card";
import { RouteCard } from "@/components/route-card";
import { ScenarioCardRail } from "@/components/scenario-card-rail";
import {
  assistantQuestions,
  places,
  PlannerGoal,
  PlannerPreferences,
  scenarios,
} from "@/lib/fasttrack-data";
import {
  buildPlannerPlan,
  describeRouteDelta,
  getDestinationsForOrigin,
  getModeLabel,
  getPlaceById,
} from "@/lib/fasttrack-routing";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const goalOptions: { id: PlannerGoal; label: string; hint: string }[] = [
  { id: "fastest", label: "Fastest", hint: "Prioritize pure ETA gains." },
  {
    id: "fewest_transfers",
    label: "Fewer transfers",
    hint: "Prefer cleaner route topology.",
  },
  {
    id: "least_walking",
    label: "Less walking",
    hint: "Keep first-mile and final-mile effort low.",
  },
  { id: "balance", label: "Balanced", hint: "Blend speed, simplicity, and comfort." },
];

const micromobilityOptions: {
  id: PlannerPreferences["micromobilityMode"];
  label: string;
}[] = [
  { id: "any", label: "Any micromobility" },
  { id: "personal", label: "My own bike / scooter" },
  { id: "shared", label: "Shared only" },
  { id: "avoid", label: "Transit only" },
];

const trustBadges = [
  "NYC demo coverage",
  "Transit + micromobility",
  "Explains why it is faster",
];

export function FastTrackApp() {
  const [originId, setOriginId] = useState(scenarios[0].originId);
  const [destinationId, setDestinationId] = useState(scenarios[0].destinationId);
  const [preferences, setPreferences] = useState<PlannerPreferences>({
    goal: "fastest",
    micromobilityMode: "any",
  });
  const [activeRouteId, setActiveRouteId] = useState(scenarios[0].routes[1].id);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "assistant-intro",
      role: "assistant",
      content:
        "FastTrack NYC compares the transit-only baseline against mixed-mode options, then highlights how micromobility changes the transit graph in your favor.",
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
  const activeRoute =
    plan.rankedRoutes.find((route) => route.id === activeRouteId) ??
    plan.recommendedRoute;

  const originPlace = getPlaceById(plan.scenario.originId, places);
  const destinationPlace = getPlaceById(plan.scenario.destinationId, places);

  function applyScenario(scenarioId: string) {
    const scenario = scenarios.find((entry) => entry.id === scenarioId) ?? scenarios[0];

    startTransition(() => {
      setOriginId(scenario.originId);
      setDestinationId(scenario.destinationId);
      setActiveRouteId(scenario.routes[1]?.id ?? scenario.routes[0].id);
      setMessages((current) => [
        current[0],
        {
          id: `scenario-${scenario.id}`,
          role: "assistant",
          content: `${scenario.headline} ${scenario.heroMetric}.`,
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
        response = `${activeRoute.name} is ${Math.max(activeRoute.timeSaved, 0)} minutes faster because it ${activeRoute.unlock.toLowerCase()}. That drops the walking burden from ${baseline.metrics.walkMin} to ${activeRoute.metrics.walkMin} minutes and keeps the trip at ${activeRoute.metrics.transfers} transfers.`;
        break;
      case "Can I do this without a rental?":
        response = personalOption
          ? `Yes. ${personalOption.name} is the best bring-your-own option here. It lands in ${personalOption.metrics.totalMin} minutes and parking stays straightforward: ${personalOption.parking}.`
          : "The strongest mixed-mode option in this scenario currently depends on shared micromobility, but the transit-only baseline remains available if you do not want a rental.";
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
        response = `Micromobility saves ${Math.max(activeRoute.timeSaved, 0)} minutes on this trip by improving your access to stronger transit, not just by shortening the last block.`;
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
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1480px] flex-col gap-8 px-4 py-4 sm:px-6 lg:px-8">
        <header className="glass-panel rounded-[30px] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="glow-ring flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(102,225,218,0.14)] text-lg font-semibold text-[var(--teal)]">
                FT
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-[var(--teal)]">
                  FastTrack NYC
                </p>
                <p className="text-sm text-[var(--muted)]">
                  Mixed-mode routing for New York commuters
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {trustBadges.map((badge) => (
                <span
                  key={badge}
                  className="pill rounded-full px-4 py-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="glass-panel relative overflow-hidden rounded-[34px] px-6 py-7 sm:px-8 sm:py-8">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[rgba(115,167,255,0.18)] blur-3xl" />
            <div className="absolute bottom-[-2rem] left-[-2rem] h-44 w-44 rounded-full bg-[rgba(102,225,218,0.16)] blur-3xl" />

            <div className="relative z-10 flex flex-col gap-8">
              <div className="max-w-3xl">
                <p className="mb-4 text-sm uppercase tracking-[0.3em] text-[var(--amber)]">
                  Faster commutes by unlocking better transit
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl xl:text-6xl">
                  Ride a few minutes. Skip the slow transfer chain. Reach better
                  transit faster.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  FastTrack NYC compares the usual subway-and-walk trip with mixed-mode
                  options that use your own bike, your own scooter, or shared
                  micromobility to unlock stronger stations and faster service.
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="route-accent rounded-[28px] border border-[var(--line)] p-5">
                  <div className="grid gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-[var(--sky)]">
                        Plan a commute
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        Demo mode is intentionally curated around strong NYC scenarios.
                        Every result compares the baseline against route shapes that
                        unlock better transit.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          Origin
                        </span>
                        <select
                          value={originId}
                          onChange={(event) => {
                            const nextOriginId = event.target.value;
                            const nextDestinations = getDestinationsForOrigin(nextOriginId);

                            setOriginId(nextOriginId);
                            setDestinationId(
                              nextDestinations[0]?.destinationId ??
                                scenarios[0].destinationId,
                            );
                          }}
                          className="w-full rounded-2xl border border-[var(--line)] bg-[rgba(2,10,20,0.46)] px-4 py-3 text-sm text-white outline-none transition focus:border-[rgba(102,225,218,0.44)]"
                        >
                          {Array.from(
                            new Set(scenarios.map((scenario) => scenario.originId)),
                          ).map((value) => {
                            const place = getPlaceById(value, places);

                            return (
                              <option key={value} value={value}>
                                {place?.name}
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          Destination
                        </span>
                        <select
                          value={resolvedDestinationId}
                          onChange={(event) => setDestinationId(event.target.value)}
                          className="w-full rounded-2xl border border-[var(--line)] bg-[rgba(2,10,20,0.46)] px-4 py-3 text-sm text-white outline-none transition focus:border-[rgba(102,225,218,0.44)]"
                        >
                          {destinationOptions.map((scenario) => {
                            const place = getPlaceById(scenario.destinationId, places);

                            return (
                              <option
                                key={scenario.destinationId}
                                value={scenario.destinationId}
                              >
                                {place?.name}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-3">
                      <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                        Micromobility mode
                      </span>
                      <div className="grid gap-2">
                        {micromobilityOptions.map((option) => {
                          const isSelected =
                            preferences.micromobilityMode === option.id;

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
                              className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                                isSelected
                                  ? "border-[rgba(247,191,103,0.5)] bg-[rgba(247,191,103,0.12)] text-white"
                                  : "border-[var(--line)] bg-[rgba(255,255,255,0.04)] text-[var(--muted)] hover:border-[rgba(247,191,103,0.4)]"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="soft-panel rounded-[24px] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--teal)]">
                        Current planning lens
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {goalOptions.map((goal) => (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() =>
                              setPreferences((current) => ({
                                ...current,
                                goal: goal.id,
                              }))
                            }
                            className={`rounded-full px-4 py-2 text-sm transition ${
                              preferences.goal === goal.id
                                ? "bg-white text-slate-950"
                                : "bg-[rgba(255,255,255,0.06)] text-[var(--muted)] hover:bg-[rgba(255,255,255,0.12)]"
                            }`}
                          >
                            {goal.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="soft-panel rounded-[28px] p-5">
                  <p className="text-sm uppercase tracking-[0.24em] text-[var(--sky)]">
                    Why it works
                  </p>
                  <div className="mt-4 space-y-4 text-sm leading-6 text-[var(--muted)]">
                    <p>
                      FastTrack NYC is built around one idea: micromobility should
                      improve your access to the transit graph, not just shorten a walk.
                    </p>
                    <div className="rounded-3xl border border-[var(--line)] bg-[rgba(255,255,255,0.03)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--amber)]">
                        Current recommendation
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {plan.recommendedRoute.metrics.totalMin} min
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {describeRouteDelta(
                          plan.recommendedRoute,
                          plan.transitOnlyRoute,
                        )}
                      </p>
                    </div>
                    <p>
                      Mode setting:{" "}
                      <span className="text-white">
                        {getModeLabel(preferences.micromobilityMode)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {goalOptions.map((goalOption) => {
                  const isSelected = preferences.goal === goalOption.id;

                  return (
                    <button
                      key={goalOption.id}
                      type="button"
                      onClick={() =>
                        setPreferences((current) => ({
                          ...current,
                          goal: goalOption.id,
                        }))
                      }
                      className={`rounded-[24px] border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-[rgba(102,225,218,0.44)] bg-[rgba(102,225,218,0.14)]"
                          : "border-[var(--line)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(115,167,255,0.44)]"
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{goalOption.label}</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                        {goalOption.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <MapCard plan={plan} activeRoute={activeRoute} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="glass-panel rounded-[34px] p-6 sm:p-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-[var(--teal)]">
                  Best route options
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">
                  {originPlace?.name} to {destinationPlace?.name}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                  {plan.scenario.description}
                </p>
              </div>
              <div className="rounded-[24px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--muted)]">
                {plan.scenario.heroMetric}
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {plan.rankedRoutes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  baseline={plan.transitOnlyRoute}
                  isActive={activeRoute.id === route.id}
                  onSelect={() => setActiveRouteId(route.id)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <AssistantCard
              questions={assistantQuestions}
              messages={messages}
              onQuestionClick={handleAssistantQuestion}
              activeRouteLabel={activeRoute.name}
            />
            <ScenarioCardRail activeScenarioId={plan.scenario.id} onSelect={applyScenario} />
          </div>
        </section>
      </div>
    </main>
  );
}
