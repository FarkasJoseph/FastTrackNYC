import { places, scenarios } from "@/lib/fasttrack-data";
import { getPlaceById } from "@/lib/fasttrack-routing";

export function ScenarioCardRail({
  activeScenarioId,
  onSelect,
}: {
  activeScenarioId: string;
  onSelect: (scenarioId: string) => void;
}) {
  return (
    <div className="glass-panel rounded-[34px] p-6 sm:p-7">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-[var(--amber)]">
          Demo scenarios
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
          High-impact NYC stories
        </h2>
      </div>

      <div className="mt-5 grid gap-3">
        {scenarios.map((scenario) => {
          const isActive = scenario.id === activeScenarioId;
          const origin = getPlaceById(scenario.originId, places);
          const destination = getPlaceById(scenario.destinationId, places);

          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onSelect(scenario.id)}
              className={`rounded-[26px] border p-4 text-left transition ${
                isActive
                  ? "border-[rgba(247,191,103,0.46)] bg-[rgba(247,191,103,0.1)]"
                  : "border-[var(--line)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(247,191,103,0.32)]"
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">
                    {origin?.name} to {destination?.name}
                  </p>
                  <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-3 py-1 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                    {scenario.heroMetric}
                  </span>
                </div>
                <p className="text-sm leading-6 text-[var(--muted)]">{scenario.headline}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
