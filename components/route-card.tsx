import { RouteLeg } from "@/lib/fasttrack-data";
import {
  PlannerPlan,
  describeRouteDelta,
  formatMoney,
} from "@/lib/fasttrack-routing";

export function RouteCard({
  route,
  baseline,
  isActive,
  onSelect,
}: {
  route: PlannerPlan["recommendedRoute"];
  baseline: PlannerPlan["transitOnlyRoute"];
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[28px] border p-5 text-left transition ${
        isActive
          ? "border-[rgba(102,225,218,0.5)] bg-[rgba(102,225,218,0.1)]"
          : "border-[var(--line)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(115,167,255,0.38)]"
      }`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              #{route.rank}
            </span>
            <span className="rounded-full bg-[rgba(247,191,103,0.12)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--amber)]">
              {route.bestFor}
            </span>
          </div>
          <div>
            <h3 className="text-2xl font-semibold tracking-[-0.03em] text-white">
              {route.name}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {describeRouteDelta(route, baseline)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            <span className="pill rounded-full px-3 py-2">
              {route.metrics.walkMin} min walking
            </span>
            <span className="pill rounded-full px-3 py-2">
              {route.metrics.micromobilityMin} min riding
            </span>
            <span className="pill rounded-full px-3 py-2">
              {route.metrics.transfers} transfers
            </span>
            <span className="pill rounded-full px-3 py-2">
              {formatMoney(route.metrics.costUsd)}
            </span>
          </div>
        </div>

        <div className="min-w-[190px] rounded-[24px] border border-[var(--line)] bg-[rgba(2,10,20,0.4)] px-4 py-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
            Total travel time
          </p>
          <p className="mt-1 text-4xl font-semibold tracking-[-0.05em] text-white">
            {route.metrics.totalMin}
            <span className="ml-1 text-base font-medium text-[var(--muted)]">min</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{route.unlock}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {route.legs.map((leg) => (
          <RouteLegRow key={leg.id} leg={leg} />
        ))}
      </div>
    </button>
  );
}

function RouteLegRow({ leg }: { leg: RouteLeg }) {
  const colorClass =
    leg.mode === "transit"
      ? "bg-[rgba(115,167,255,0.18)] text-[var(--sky)]"
      : leg.mode === "walk"
        ? "bg-[rgba(247,191,103,0.18)] text-[var(--amber)]"
        : "bg-[rgba(102,225,218,0.18)] text-[var(--teal)]";

  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-[rgba(164,191,229,0.12)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.15em] ${colorClass}`}>
        {leg.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{leg.details}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
          {leg.durationMin} min
          {leg.lineName ? ` • ${leg.lineName}` : ""}
        </p>
      </div>
    </div>
  );
}
