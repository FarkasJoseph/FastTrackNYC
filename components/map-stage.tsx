"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { places } from "@/lib/fasttrack-data";
import { RouteSurfaceLegGeometry } from "@/lib/mapbox/types";
import { MtaTransitLegIntel } from "@/lib/mta/types";
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
  transitLegs,
  transitIntelStatus,
  surfaceLegGeometries,
  surfaceGeometryStatus,
  className,
}: {
  plan: PlannerPlan;
  activeRoute: PlannerPlan["recommendedRoute"];
  transitLegs?: MtaTransitLegIntel[];
  transitIntelStatus?: "loading" | "ready" | "error";
  surfaceLegGeometries?: RouteSurfaceLegGeometry[];
  surfaceGeometryStatus?: "loading" | "ready" | "error";
  className?: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const latestTransitLegsRef = useRef<MtaTransitLegIntel[]>([]);
  const latestSurfaceLegGeometriesRef = useRef<RouteSurfaceLegGeometry[]>([]);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const [renderMode, setRenderMode] = useState<"waiting" | "resolved">("resolved");
  const [resolvedTransitLegs, setResolvedTransitLegs] = useState<MtaTransitLegIntel[]>([]);
  const [resolvedSurfaceLegGeometries, setResolvedSurfaceLegGeometries] = useState<
    RouteSurfaceLegGeometry[]
  >([]);
  const visiblePlaceIds = Array.from(
    new Set(activeRoute.legs.flatMap((leg) => [leg.fromPlaceId, leg.toPlaceId])),
  );
  const visiblePlaces = places.filter((place) => visiblePlaceIds.includes(place.id));
  const hasLiveMap = Boolean(token);
  const activeRouteHasTransit = activeRoute.legs.some((leg) => leg.mode === "transit");
  const activeRouteHasStreetLegs = activeRoute.legs.some(
    (leg) =>
      leg.mode === "walk" ||
      leg.mode === "personal_micromobility" ||
      leg.mode === "shared_micromobility",
  );
  const hasAsyncGeometry = activeRouteHasTransit || activeRouteHasStreetLegs;

  const renderableTransitLegs = useMemo(
    () =>
      resolvedTransitLegs.filter(
        (transitLeg) =>
          transitLeg.status === "ok" &&
          Boolean(transitLeg.geometry) &&
          (transitLeg.geometry?.coordinates.length ?? 0) > 1,
      ),
    [resolvedTransitLegs],
  );
  const hasRenderableTransitGeometry = renderableTransitLegs.length > 0;
  const resolvedSurfaceGeometryByLegId = useMemo(
    () =>
      new Map(
        resolvedSurfaceLegGeometries.map((legGeometry) => [legGeometry.legId, legGeometry]),
      ),
    [resolvedSurfaceLegGeometries],
  );

  useEffect(() => {
    latestTransitLegsRef.current = transitLegs ?? [];
  }, [transitLegs]);

  useEffect(() => {
    latestSurfaceLegGeometriesRef.current = surfaceLegGeometries ?? [];
  }, [surfaceLegGeometries]);

  useEffect(() => {
    setResolvedTransitLegs([]);
    setResolvedSurfaceLegGeometries([]);

    if (!hasAsyncGeometry) {
      setRenderMode("resolved");
      return;
    }

    setRenderMode("waiting");
    const timeoutId = window.setTimeout(() => {
      setRenderMode((current) => {
        if (current !== "waiting") {
          return current;
        }

        setResolvedTransitLegs(latestTransitLegsRef.current);
        setResolvedSurfaceLegGeometries(latestSurfaceLegGeometriesRef.current);

        return "resolved";
      });
    }, 2500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeRoute.id, hasAsyncGeometry]);

  useEffect(() => {
    if (!hasAsyncGeometry || renderMode !== "waiting") {
      return;
    }

    const transitSettled = !activeRouteHasTransit || transitIntelStatus !== "loading";
    const surfaceSettled = !activeRouteHasStreetLegs || surfaceGeometryStatus !== "loading";

    if (transitSettled && surfaceSettled) {
      setResolvedTransitLegs(transitLegs ?? []);
      setResolvedSurfaceLegGeometries(surfaceLegGeometries ?? []);
      setRenderMode("resolved");
    }
  }, [
    activeRouteHasStreetLegs,
    activeRouteHasTransit,
    hasAsyncGeometry,
    renderMode,
    surfaceGeometryStatus,
    surfaceLegGeometries,
    transitIntelStatus,
    transitLegs,
  ]);

  useEffect(() => {
    if (!token || !mapRef.current || renderMode === "waiting") {
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
          const liveTransitLeg = renderableTransitLegs.find(
            (transitLeg) =>
              transitLeg.legId === leg.id &&
              transitLeg.status === "ok" &&
              transitLeg.geometry &&
              transitLeg.geometry.coordinates.length > 1,
          );
          const surfaceLegGeometry = resolvedSurfaceGeometryByLegId.get(leg.id);

          return {
            type: "Feature" as const,
            properties: {
              mode: leg.mode,
            },
            geometry: {
              type: "LineString" as const,
              coordinates:
                leg.mode === "transit"
                  ? (liveTransitLeg?.geometry?.coordinates ?? [
                      [from?.lng ?? -73.98, from?.lat ?? 40.75],
                      [to?.lng ?? -73.98, to?.lat ?? 40.75],
                    ])
                  : (surfaceLegGeometry?.coordinates ?? [
                      [from?.lng ?? -73.98, from?.lat ?? 40.75],
                      [to?.lng ?? -73.98, to?.lat ?? 40.75],
                    ]),
            },
          };
        });
        const lineGhostFeatures = activeRoute.legs
          .map((leg) => {
            const liveTransitLeg = renderableTransitLegs.find(
              (transitLeg) => transitLeg.legId === leg.id,
            );

            if (
              leg.mode !== "transit" ||
              !liveTransitLeg?.geometry?.fullCoordinates ||
              liveTransitLeg.geometry.fullCoordinates.length <=
                liveTransitLeg.geometry.coordinates.length
            ) {
              return null;
            }

            return {
              type: "Feature" as const,
              properties: {
                mode: "transit-ghost",
              },
              geometry: {
                type: "LineString" as const,
                coordinates: liveTransitLeg.geometry.fullCoordinates,
              },
            };
          })
          .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature));

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

        map.addSource("fasttrack-route-ghost", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: lineGhostFeatures,
          },
        });

        map.addSource("fasttrack-points", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: pointFeatures,
          },
        });

        if (lineGhostFeatures.length > 0) {
          map.addLayer({
            id: "route-ghost",
            type: "line",
            source: "fasttrack-route-ghost",
            paint: {
              "line-color": "#9eb3d9",
              "line-width": 4,
              "line-opacity": 0.22,
            },
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
          });
        }

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

        for (const feature of lineFeatures) {
          for (const [lng, lat] of feature.geometry.coordinates) {
            bounds.extend([lng, lat]);
          }
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
    renderMode,
    resolvedSurfaceGeometryByLegId,
    renderableTransitLegs,
    token,
    visiblePlaces,
  ]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-[2rem]", className)}>
      {renderMode === "waiting" ? (
        <MapLoadingState />
      ) : hasLiveMap ? (
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
          {renderMode === "waiting"
            ? "Loading route"
            : hasLiveMap
              ? hasRenderableTransitGeometry || resolvedSurfaceLegGeometries.length > 0
                ? "Live route map"
                : "Route preview"
              : "Route preview"}
        </div>
      </div>
    </div>
  );
}

function MapLoadingState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(242,246,251,0.98),rgba(232,238,246,0.98))]">
      <div className="rounded-[1.6rem] border border-[var(--border-soft)] bg-white/92 px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
          <LoaderCircle className="size-4 animate-spin text-[var(--accent)]" />
          Loading
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
