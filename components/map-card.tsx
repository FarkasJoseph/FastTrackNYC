import { places } from "@/lib/fasttrack-data";
import { PlannerPlan, getPlaceById } from "@/lib/fasttrack-routing";

export function MapCard({
  plan,
  activeRoute,
}: {
  plan: PlannerPlan;
  activeRoute: PlannerPlan["recommendedRoute"];
}) {
  const visiblePlaceIds = Array.from(
    new Set(activeRoute.legs.flatMap((leg) => [leg.fromPlaceId, leg.toPlaceId])),
  );
  const visiblePlaces = places.filter((place) => visiblePlaceIds.includes(place.id));
  const lats = visiblePlaces.map((place) => place.lat);
  const lngs = visiblePlaces.map((place) => place.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  function project(placeId: string) {
    const place = getPlaceById(placeId, places);

    if (!place) {
      return { x: 50, y: 50 };
    }

    const x = ((place.lng - minLng) / Math.max(maxLng - minLng, 0.0001)) * 74 + 13;
    const y = (1 - (place.lat - minLat) / Math.max(maxLat - minLat, 0.0001)) * 72 + 12;

    return { x, y };
  }

  return (
    <div className="glass-panel rounded-[34px] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-[var(--sky)]">
            Live route canvas
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-white">
            {activeRoute.name}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            {plan.scenario.headline}
          </p>
        </div>
        <div className="rounded-[24px] border border-[var(--line)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            ETA
          </p>
          <p className="mt-1 text-3xl font-semibold text-white">
            {activeRoute.metrics.totalMin} min
          </p>
        </div>
      </div>

      <div className="map-shell relative mt-5 overflow-hidden rounded-[28px] border border-[var(--line)] p-4 sm:p-5">
        <svg
          viewBox="0 0 100 100"
          className="relative z-10 h-[300px] w-full sm:h-[380px]"
          aria-hidden="true"
        >
          {activeRoute.legs.map((leg) => {
            const from = project(leg.fromPlaceId);
            const to = project(leg.toPlaceId);
            const stroke =
              leg.mode === "transit"
                ? "#73a7ff"
                : leg.mode === "walk"
                  ? "#f7bf67"
                  : "#66e1da";

            return (
              <line
                key={leg.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={stroke}
                strokeWidth={leg.mode === "walk" ? 2.8 : 4}
                strokeDasharray={leg.mode === "walk" ? "3 2" : undefined}
                strokeLinecap="round"
                opacity={0.96}
              />
            );
          })}

          {visiblePlaces.map((place) => {
            const point = project(place.id);

            return (
              <g key={place.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={place.id === plan.scenario.originId || place.id === plan.scenario.destinationId ? 2.8 : 2.1}
                  fill={
                    place.id === plan.scenario.originId
                      ? "#66e1da"
                      : place.id === plan.scenario.destinationId
                        ? "#f7bf67"
                        : "#edf4ff"
                  }
                />
                <text
                  x={point.x + 2.6}
                  y={point.y - 2.8}
                  fill="#dce8ff"
                  fontSize="3.2"
                  fontFamily="Avenir Next, Segoe UI, sans-serif"
                >
                  {place.name}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="relative z-10 mt-2 grid gap-3 md:grid-cols-3">
          <MetricPill
            label="Time saved"
            value={
              activeRoute.isTransitOnly
                ? "Baseline"
                : `${Math.max(activeRoute.timeSaved, 0)} min`
            }
          />
          <MetricPill label="Transfers" value={String(activeRoute.metrics.transfers)} />
          <MetricPill label="Walking" value={`${activeRoute.metrics.walkMin} min`} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <InfoTile label="Transit unlock" value={activeRoute.unlock} />
        <InfoTile label="Parking / docking" value={activeRoute.parking} />
        <InfoTile
          label="Confidence"
          value={`${Math.round(activeRoute.metrics.confidence * 100)}%`}
        />
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--line)] bg-[rgba(255,255,255,0.04)] px-4 py-4">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="soft-panel rounded-[24px] p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-white">{value}</p>
    </div>
  );
}
