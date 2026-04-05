"use client";

import { startTransition, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bike,
  Clock3,
  Footprints,
  Route as RouteIcon,
  Sparkles,
  TrainFront,
  Waves,
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
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  const activeRoute =
    plan.rankedRoutes.find((route) => route.id === activeRouteId) ??
    plan.recommendedRoute;
  const alternateRoutes = plan.rankedRoutes.filter((route) => route.id !== activeRoute.id);
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
                    {plan.scenario.heroMetric}
                  </Badge>
                </div>

                <div className="mt-3">
                  <p className="metric-mono text-3xl font-medium tracking-[-0.05em] text-[var(--text)]">
                    {activeRoute.metrics.totalMin}
                    <span className="ml-1 text-base text-[var(--text-muted)]">min</span>
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                    {describeRouteDelta(activeRoute, plan.transitOnlyRoute)}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-[1.45rem] border border-[var(--border-soft)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">
                      {activeRoute.name}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                      {activeRoute.unlock}
                    </p>
                  </div>
                  <span className="metric-mono text-lg text-[var(--text)]">
                    {activeRoute.metrics.totalMin}m
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MetricTile
                    icon={<Clock3 className="size-4" />}
                    label="Walking"
                    value={`${activeRoute.metrics.walkMin} min`}
                  />
                  <MetricTile
                    icon={<Bike className="size-4" />}
                    label="Micromobility"
                    value={`${activeRoute.metrics.micromobilityMin} min`}
                  />
                  <MetricTile
                    icon={<RouteIcon className="size-4" />}
                    label="Transfers"
                    value={String(activeRoute.metrics.transfers)}
                  />
                  <MetricTile
                    icon={<Waves className="size-4" />}
                    label="Cost"
                    value={formatMoney(activeRoute.metrics.costUsd)}
                  />
                </div>

                <div className="mt-4 rounded-[1.2rem] bg-[var(--surface-muted)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--text)]">Route flow</p>
                    <p className="text-xs text-[var(--text-muted)]">{activeRoute.parking}</p>
                  </div>
                  <RouteTimeline legs={activeRoute.legs} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="rounded-full bg-[var(--accent)] px-4 text-white hover:bg-[var(--accent)]/90"
                    onClick={() => setAssistantOpen(true)}
                  >
                    <Sparkles className="mr-1 size-4" />
                    Explain this route
                  </Button>
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
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Compare route tradeoffs
                    </p>
                  </div>
                  <span className="metric-mono text-sm text-[var(--text-soft)]">
                    {plan.rankedRoutes.length} total
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {alternateRoutes.map((route) => (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => setActiveRouteId(route.id)}
                      className="w-full rounded-[1.15rem] border border-[var(--border-soft)] bg-white p-3 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text)]">
                            {route.name}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                            {describeRouteDelta(route, plan.transitOnlyRoute)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="metric-mono text-lg text-[var(--text)]">
                            {route.metrics.totalMin}m
                          </p>
                          <p className="text-xs text-[var(--text-soft)]">
                            {route.bestFor}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <Separator className="my-4 bg-[var(--border-soft)]" />

                <div>
                  <p className="text-sm font-medium text-[var(--text)]">Demo stories</p>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {scenarios.map((scenario) => (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => applyScenario(scenario.id)}
                        className={`min-w-[210px] rounded-[1.15rem] border px-4 py-3 text-left transition ${
                          scenario.id === plan.scenario.id
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border-soft)] bg-white hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
                        }`}
                      >
                        <p className="text-sm font-medium text-[var(--text)]">
                          {scenario.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                          {scenario.heroMetric}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <section className="min-h-[420px] overflow-hidden rounded-[1.75rem] lg:min-h-0">
            <MapStage plan={plan} activeRoute={activeRoute} className="h-full min-h-[420px]" />
          </section>
        </div>
      </div>

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

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1rem] bg-[var(--surface-muted)] px-3 py-3">
      <div className="flex items-center gap-2 text-[var(--text-soft)]">{icon}</div>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-soft)]">
        {label}
      </p>
      <p className="metric-mono mt-1 text-base font-medium text-[var(--text)]">{value}</p>
    </div>
  );
}

function RouteTimeline({ legs }: { legs: RouteLeg[] }) {
  const totalDuration = legs.reduce((sum, leg) => sum + leg.durationMin, 0);

  return (
    <div className="mt-4">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white">
        {legs.map((leg) => {
          const width = `${(leg.durationMin / totalDuration) * 100}%`;

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

      <div className="mt-3 flex flex-wrap gap-2">
        {legs.map((leg) => (
          <div
            key={leg.id}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
              leg.mode === "transit"
                ? "mode-transit"
                : leg.mode === "walk"
                  ? "mode-walk"
                  : "mode-micro"
            }`}
          >
            {getLegIcon(leg)}
            <span>{leg.durationMin} min</span>
            <span className="hidden text-[var(--text-muted)] sm:inline">
              {leg.mode === "transit" ? leg.lineName ?? "Transit" : leg.label}
            </span>
          </div>
        ))}
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
