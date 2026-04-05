"use client";

import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { places } from "@/lib/fasttrack-data";
import { cn } from "@/lib/utils";
import { PlannerPlan, getPlaceById } from "@/lib/fasttrack-routing";

const modeColors: Record<string, string> = {
  transit: "#245bdb",
  walk: "#d48b1f",
  personal_micromobility: "#0f9d8f",
  shared_micromobility: "#0f9d8f",
};

export function MapStage({
  plan,
  activeRoute,
  className,
}: {
  plan: PlannerPlan;
  activeRoute: PlannerPlan["recommendedRoute"];
  className?: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const visiblePlaceIds = Array.from(
    new Set(activeRoute.legs.flatMap((leg) => [leg.fromPlaceId, leg.toPlaceId])),
  );
  const visiblePlaces = places.filter((place) => visiblePlaceIds.includes(place.id));
  const hasLiveMap = Boolean(token);

  useEffect(() => {
    if (!token || !mapRef.current) {
      return;
    }

    let cancelled = false;
    let map: import("mapbox-gl").Map | null = null;
    const markers: Array<{ remove: () => void }> = [];

    void (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;

      if (cancelled || !mapRef.current) {
        return;
      }

      mapboxgl.accessToken = token;

      map = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        interactive: false,
        attributionControl: false,
      });

      map.on("load", () => {
        if (!map || cancelled) {
          return;
        }

        const lineFeatures = activeRoute.legs.map((leg) => {
          const from = getPlaceById(leg.fromPlaceId, places);
          const to = getPlaceById(leg.toPlaceId, places);

          return {
            type: "Feature" as const,
            properties: {
              mode: leg.mode,
            },
            geometry: {
              type: "LineString" as const,
              coordinates: [
                [from?.lng ?? -73.98, from?.lat ?? 40.75],
                [to?.lng ?? -73.98, to?.lat ?? 40.75],
              ],
            },
          };
        });

        const pointFeatures = visiblePlaces.map((place) => ({
          type: "Feature" as const,
          properties: {
            name: place.name,
            role:
              place.id === plan.scenario.originId
                ? "origin"
                : place.id === plan.scenario.destinationId
                  ? "destination"
                  : "waypoint",
          },
          geometry: {
            type: "Point" as const,
            coordinates: [place.lng, place.lat],
          },
        }));

        map.addSource("fasttrack-route", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: lineFeatures,
          },
        });

        map.addSource("fasttrack-points", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: pointFeatures,
          },
        });

        map.addLayer({
          id: "route-casing",
          type: "line",
          source: "fasttrack-route",
          paint: {
            "line-color": "#ffffff",
            "line-width": 10,
            "line-opacity": 0.9,
          },
        });

        map.addLayer({
          id: "route-line",
          type: "line",
          source: "fasttrack-route",
          paint: {
            "line-color": [
              "match",
              ["get", "mode"],
              "transit",
              "#245bdb",
              "walk",
              "#d48b1f",
              "#0f9d8f",
            ],
            "line-width": 6,
            "line-opacity": 0.96,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });

        for (const place of visiblePlaces) {
          const element = document.createElement("div");
          const role =
            place.id === plan.scenario.originId
              ? "origin"
              : place.id === plan.scenario.destinationId
                ? "destination"
                : "waypoint";
          const color =
            role === "origin"
              ? "#0f9d8f"
              : role === "destination"
                ? "#d48b1f"
                : "#245bdb";

          element.style.width = role === "waypoint" ? "12px" : "16px";
          element.style.height = role === "waypoint" ? "12px" : "16px";
          element.style.borderRadius = "999px";
          element.style.background = color;
          element.style.border = "2px solid white";
          element.style.boxShadow = "0 6px 16px rgba(17, 34, 51, 0.18)";

          markers.push(
            new mapboxgl.Marker({
              element,
            })
              .setLngLat([place.lng, place.lat])
              .addTo(map),
          );
        }

        const bounds = new mapboxgl.LngLatBounds();

        for (const place of visiblePlaces) {
          bounds.extend([place.lng, place.lat]);
        }

        map.fitBounds(bounds, {
          padding: 80,
          duration: 0,
          maxZoom: 12.8,
        });
      });
    })();

    return () => {
      cancelled = true;
      for (const marker of markers) {
        marker.remove();
      }
      map?.remove();
    };
  }, [
    activeRoute.id,
    activeRoute.legs,
    plan.scenario.destinationId,
    plan.scenario.originId,
    token,
    visiblePlaces,
  ]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-[2rem]", className)}>
      {hasLiveMap ? (
        <div ref={mapRef} className="h-full w-full" />
      ) : (
        <StaticRouteMap plan={plan} activeRoute={activeRoute} />
      )}

      <div className="map-scrim pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-6">
        <div className="route-pill rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
          NYC mixed-mode routing
        </div>
        <div className="route-pill rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {hasLiveMap ? "Mapbox basemap" : "Route preview"}
        </div>
      </div>
    </div>
  );
}

function StaticRouteMap({
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

    return {
      x: ((place.lng - minLng) / Math.max(maxLng - minLng, 0.0001)) * 72 + 14,
      y: (1 - (place.lat - minLat) / Math.max(maxLat - minLat, 0.0001)) * 62 + 18,
    };
  }

  return (
    <div className="static-map absolute inset-0">
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {[12, 28, 44, 60, 76].map((value) => (
          <path
            key={`h-${value}`}
            d={`M 0 ${value} C 25 ${value - 4} 55 ${value + 5} 100 ${value - 3}`}
            fill="none"
            stroke="rgba(184,196,211,0.58)"
            strokeWidth="0.8"
          />
        ))}
        {[18, 34, 52, 68, 84].map((value) => (
          <path
            key={`v-${value}`}
            d={`M ${value} 0 C ${value - 6} 28 ${value + 4} 56 ${value - 2} 100`}
            fill="none"
            stroke="rgba(184,196,211,0.48)"
            strokeWidth="0.8"
          />
        ))}

        {activeRoute.legs.map((leg) => {
          const from = project(leg.fromPlaceId);
          const to = project(leg.toPlaceId);

          return (
            <line
              key={leg.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={modeColors[leg.mode]}
              strokeWidth={leg.mode === "walk" ? 2.6 : 4.2}
              strokeLinecap="round"
              strokeDasharray={leg.mode === "walk" ? "4 3" : undefined}
            />
          );
        })}

        {visiblePlaces.map((place) => {
          const point = project(place.id);
          const isOrigin = place.id === plan.scenario.originId;
          const isDestination = place.id === plan.scenario.destinationId;

          return (
            <g key={place.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={isOrigin || isDestination ? 2.2 : 1.5}
                fill={isOrigin ? "#0f9d8f" : isDestination ? "#d48b1f" : "#245bdb"}
                stroke="#ffffff"
                strokeWidth="1.1"
              />
              {(isOrigin || isDestination) && (
                <text
                  x={point.x + 2.4}
                  y={point.y - 2.4}
                  fill="#122033"
                  fontSize="3.4"
                  fontFamily="var(--font-geist-sans)"
                >
                  {place.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute right-4 top-14 rounded-2xl border border-[var(--border-soft)] bg-white/82 px-3 py-2 text-sm text-[var(--text-muted)] shadow-sm sm:right-6 sm:top-18">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-[var(--accent)]" />
          Stylized route map for demo mode
        </div>
      </div>
    </div>
  );
}
