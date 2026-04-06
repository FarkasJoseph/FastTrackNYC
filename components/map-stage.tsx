"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { RouteSurfaceLegGeometry } from "@/lib/mapbox/types";
import {
  type BikeParkingSuggestion,
  PlannerRouteMobilityContext,
} from "@/lib/micromobility/types";
import { MtaTransitLegIntel } from "@/lib/mta/types";
import { cn } from "@/lib/utils";
import { PlannerPlan, getPlaceById } from "@/lib/fasttrack-routing";

const PARKING_MARKER_MIN_SPACING_METERS = 91;

const modeColors: Record<string, string> = {
  transit: "#245bdb",
  bus: "#2f9e44",
  walk: "#d48b1f",
  personal_micromobility: "#0f9d8f",
  shared_micromobility: "#0f9d8f",
};

type MapAlternateRouteOverlay = {
  route: PlannerPlan["recommendedRoute"];
  totalMin: number;
  legDurations?: Record<string, number>;
  transitLegs?: MtaTransitLegIntel[];
  surfaceLegGeometries?: RouteSurfaceLegGeometry[];
};

export function MapStage({
  plan,
  activeRoute,
  activeRouteTotalMin,
  transitLegs,
  transitIntelStatus,
  surfaceLegGeometries,
  surfaceGeometryStatus,
  mobilityContext,
  mobilityContextStatus,
  alternateRoutes = [],
  onRouteSelect,
  className,
}: {
  plan: PlannerPlan;
  activeRoute: PlannerPlan["recommendedRoute"];
  activeRouteTotalMin: number;
  transitLegs?: MtaTransitLegIntel[];
  transitIntelStatus?: "loading" | "ready" | "error";
  surfaceLegGeometries?: RouteSurfaceLegGeometry[];
  surfaceGeometryStatus?: "loading" | "ready" | "error";
  mobilityContext?: PlannerRouteMobilityContext;
  mobilityContextStatus?: "loading" | "ready" | "error";
  alternateRoutes?: MapAlternateRouteOverlay[];
  onRouteSelect?: (routeId: string) => void;
  className?: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const latestTransitLegsRef = useRef<MtaTransitLegIntel[]>([]);
  const latestSurfaceLegGeometriesRef = useRef<RouteSurfaceLegGeometry[]>([]);
  const latestMobilityContextRef = useRef<PlannerRouteMobilityContext | undefined>(undefined);
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const [renderMode, setRenderMode] = useState<"waiting" | "resolved">("resolved");
  const [resolvedTransitLegs, setResolvedTransitLegs] = useState<MtaTransitLegIntel[]>([]);
  const [resolvedSurfaceLegGeometries, setResolvedSurfaceLegGeometries] = useState<
    RouteSurfaceLegGeometry[]
  >([]);
  const [resolvedMobilityContext, setResolvedMobilityContext] = useState<
    PlannerRouteMobilityContext | undefined
  >(undefined);
  const visiblePlaceIds = Array.from(
    new Set(activeRoute.legs.flatMap((leg) => [leg.fromPlaceId, leg.toPlaceId])),
  );
  const visiblePlaces = plan.placeList.filter((place) => visiblePlaceIds.includes(place.id));
  const routeStartPlaceId = activeRoute.legs[0]?.fromPlaceId;
  const routeEndPlaceId = activeRoute.legs[activeRoute.legs.length - 1]?.toPlaceId;
  const hasLiveMap = Boolean(token);
  const activeRouteHasTransit = activeRoute.legs.some((leg) => leg.mode === "transit");
  const activeRouteHasStreetLegs = activeRoute.legs.some(
    (leg) =>
      leg.mode === "bus" ||
      leg.mode === "walk" ||
      leg.mode === "personal_micromobility" ||
      leg.mode === "shared_micromobility",
  );
  const activeRouteHasMicromobility = activeRoute.legs.some(
    (leg) =>
      leg.mode === "personal_micromobility" || leg.mode === "shared_micromobility",
  );
  const hasAsyncGeometry = activeRouteHasTransit || activeRouteHasStreetLegs;
  const resolvedParkingSpots = useMemo(
    () => dedupeParkingSpots(resolvedMobilityContext?.parkingSpots ?? []),
    [resolvedMobilityContext],
  );

  const renderableTransitLegs = useMemo(
    () =>
      resolvedTransitLegs.filter(
        (transitLeg) =>
          Boolean(transitLeg.geometry) &&
          (transitLeg.geometry?.coordinates.length ?? 0) > 1,
      ),
    [resolvedTransitLegs],
  );
  const hasRenderableTransitGeometry = renderableTransitLegs.length > 0;
  const renderableTransitLegById = useMemo(
    () => new Map(renderableTransitLegs.map((transitLeg) => [transitLeg.legId, transitLeg])),
    [renderableTransitLegs],
  );
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
    latestMobilityContextRef.current = mobilityContext;
  }, [mobilityContext]);

  useEffect(() => {
    setResolvedTransitLegs([]);
    setResolvedSurfaceLegGeometries([]);
    setResolvedMobilityContext(undefined);

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
        setResolvedMobilityContext(latestMobilityContextRef.current);

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
    const mobilitySettled =
      !activeRouteHasMicromobility || mobilityContextStatus !== "loading";

    if (transitSettled && surfaceSettled && mobilitySettled) {
      setResolvedTransitLegs(transitLegs ?? []);
      setResolvedSurfaceLegGeometries(surfaceLegGeometries ?? []);
      setResolvedMobilityContext(mobilityContext);
      setRenderMode("resolved");
    }
  }, [
    activeRouteHasMicromobility,
    activeRouteHasStreetLegs,
    activeRouteHasTransit,
    hasAsyncGeometry,
    mobilityContext,
    mobilityContextStatus,
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
        interactive: true,
        attributionControl: false,
      });
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(
        new mapboxgl.NavigationControl({
          showCompass: false,
          visualizePitch: false,
        }),
        "bottom-right",
      );

      map.on("load", () => {
        if (!map || cancelled) {
          return;
        }

        const activeRouteFeatures = buildRouteFeatures({
          route: activeRoute,
          placeList: plan.placeList,
          transitLegById: renderableTransitLegById,
          surfaceGeometryByLegId: resolvedSurfaceGeometryByLegId,
        });
        const lineFeatures = activeRouteFeatures.lineFeatures;
        const lineGhostFeatures = activeRouteFeatures.lineGhostFeatures;
        const alternateRouteFeatures = alternateRoutes.flatMap((overlay) =>
          buildRouteFeatures({
            route: overlay.route,
            placeList: plan.placeList,
            transitLegById: new Map(
              (overlay.transitLegs ?? [])
                .filter(
                  (transitLeg) =>
                    Boolean(transitLeg.geometry) &&
                    (transitLeg.geometry?.coordinates.length ?? 0) > 1,
                )
                .map((transitLeg) => [transitLeg.legId, transitLeg]),
            ),
            surfaceGeometryByLegId: new Map(
              (overlay.surfaceLegGeometries ?? []).map((legGeometry) => [
                legGeometry.legId,
                legGeometry,
              ]),
            ),
            routeId: overlay.route.id,
            variant: "alternate",
          }).lineFeatures,
        );

        const pointFeatures = visiblePlaces.map((place) => ({
          type: "Feature" as const,
          properties: {
            name: place.name,
            role:
              place.id === routeStartPlaceId
                ? "origin"
                : place.id === routeEndPlaceId
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

        map.addSource("fasttrack-alt-routes", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: alternateRouteFeatures,
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

        if (alternateRouteFeatures.length > 0) {
          map.addLayer({
            id: "alternate-route-casing",
            type: "line",
            source: "fasttrack-alt-routes",
            paint: {
              "line-color": "#ffffff",
              "line-width": 8,
              "line-opacity": 0.72,
            },
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
          });

          map.addLayer({
            id: "alternate-route-line",
            type: "line",
            source: "fasttrack-alt-routes",
            paint: {
              "line-color": [
                "match",
                ["get", "mode"],
                "transit",
                "#5f86e8",
                "bus",
                "#67bb78",
                "walk",
                "#e0b25d",
                "#53bdb1",
              ],
              "line-width": 4,
              "line-opacity": 0.46,
            },
            layout: {
              "line-cap": "round",
              "line-join": "round",
            },
          });

          if (onRouteSelect) {
            map.on("mouseenter", "alternate-route-line", () => {
              map?.getCanvas().style.setProperty("cursor", "pointer");
            });
            map.on("mouseleave", "alternate-route-line", () => {
              map?.getCanvas().style.setProperty("cursor", "");
            });
            map.on("click", "alternate-route-line", (event) => {
              const routeId = event.features?.[0]?.properties?.routeId;

              if (typeof routeId === "string") {
                onRouteSelect(routeId);
              }
            });
          }
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
              "bus",
              "#2f9e44",
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
            place.id === routeStartPlaceId
              ? "origin"
              : place.id === routeEndPlaceId
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

        const activeRouteCoordinates = getRouteCoordinates({
          route: activeRoute,
          placeList: plan.placeList,
          transitLegById: renderableTransitLegById,
          surfaceGeometryByLegId: resolvedSurfaceGeometryByLegId,
        });
        const activePopupCoordinate = getRouteBadgeCoordinate(activeRouteCoordinates, 0.54);

        if (activePopupCoordinate) {
          const activeRouteSummary = formatAlternateRouteSummary(activeRoute, resolvedTransitLegs);
          const element = createRouteBadge({
            totalMin: activeRouteTotalMin,
            summary: activeRouteSummary,
            title: `${activeRouteTotalMin} min via ${activeRouteSummary}`,
            variant: "active",
          });

          markers.push(
            new mapboxgl.Marker({
              element,
              anchor: "bottom",
              offset: [0, -18],
            })
              .setLngLat(activePopupCoordinate)
              .addTo(map),
          );
        }

        const alternateBadgeFractions = [0.32, 0.72, 0.18, 0.84];

        for (const [overlayIndex, overlay] of alternateRoutes.entries()) {
          const alternateRouteSummary = formatAlternateRouteSummary(
            overlay.route,
            overlay.transitLegs,
          );
          const coordinates = getRouteCoordinates({
            route: overlay.route,
            placeList: plan.placeList,
            transitLegById: new Map(
              (overlay.transitLegs ?? [])
                .filter(
                  (transitLeg) =>
                    transitLeg.status === "ok" &&
                    Boolean(transitLeg.geometry) &&
                    (transitLeg.geometry?.coordinates.length ?? 0) > 1,
                )
                .map((transitLeg) => [transitLeg.legId, transitLeg]),
            ),
            surfaceGeometryByLegId: new Map(
              (overlay.surfaceLegGeometries ?? []).map((legGeometry) => [
                legGeometry.legId,
                legGeometry,
              ]),
            ),
          });
          const popupCoordinate = getRouteBadgeCoordinate(
            coordinates,
            alternateBadgeFractions[overlayIndex] ?? 0.72,
          );

          if (!popupCoordinate) {
            continue;
          }

          const element = createRouteBadge({
            totalMin: overlay.totalMin,
            summary: alternateRouteSummary,
            title: `${overlay.totalMin} min via ${alternateRouteSummary}`,
            variant: "alternate",
            onClick: () => onRouteSelect?.(overlay.route.id),
          });

          markers.push(
            new mapboxgl.Marker({
              element,
              anchor: "bottom",
              offset: [0, -14],
            })
              .setLngLat(popupCoordinate)
              .addTo(map),
          );
        }

        for (const station of resolvedMobilityContext?.sharedStations ?? []) {
          const element = createMapBadge({
            label: station.role === "pickup" ? "PICKUP" : "RETURN",
            background: station.role === "pickup" ? "#0f9d8f" : "#245bdb",
            textColor: "#ffffff",
            title: formatSharedStationMarkerTitle(station),
          });

          markers.push(
            new mapboxgl.Marker({
              element,
              anchor: "center",
            })
              .setLngLat([station.lng, station.lat])
              .addTo(map),
          );
        }

        for (const parkingSpot of resolvedParkingSpots) {
          const element = createMapBadge({
            label: "P",
            background: "#ffffff",
            textColor: "#122033",
            borderColor: "#122033",
            title: `${parkingSpot.name}. ${parkingSpot.rackType}. ${formatMetersAsWalkTime(parkingSpot.distanceMeters)}.`,
          });

          markers.push(
            new mapboxgl.Marker({
              element,
              anchor: "center",
            })
              .setLngLat([parkingSpot.lng, parkingSpot.lat])
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

        for (const feature of alternateRouteFeatures) {
          for (const [lng, lat] of feature.geometry.coordinates) {
            bounds.extend([lng, lat]);
          }
        }

        for (const station of resolvedMobilityContext?.sharedStations ?? []) {
          bounds.extend([station.lng, station.lat]);
        }

        for (const parkingSpot of resolvedParkingSpots) {
          bounds.extend([parkingSpot.lng, parkingSpot.lat]);
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
    activeRoute,
    activeRoute.id,
    activeRoute.legs,
    activeRouteTotalMin,
    alternateRoutes,
    onRouteSelect,
    plan.placeList,
    renderMode,
    resolvedMobilityContext,
    resolvedParkingSpots,
    resolvedSurfaceGeometryByLegId,
    resolvedTransitLegs,
    renderableTransitLegById,
    renderableTransitLegs,
    routeEndPlaceId,
    routeStartPlaceId,
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

function createMapBadge({
  label,
  background,
  textColor,
  borderColor = "#ffffff",
  title,
}: {
  label: string;
  background: string;
  textColor: string;
  borderColor?: string;
  title?: string;
}) {
  const element = document.createElement("div");

  element.textContent = label;
  element.style.minWidth = label.length > 1 ? "34px" : "22px";
  element.style.height = "22px";
  element.style.padding = label.length > 1 ? "0 8px" : "0";
  element.style.display = "flex";
  element.style.alignItems = "center";
  element.style.justifyContent = "center";
  element.style.borderRadius = "999px";
  element.style.background = background;
  element.style.color = textColor;
  element.style.border = `2px solid ${borderColor}`;
  element.style.boxShadow = "0 8px 20px rgba(17, 34, 51, 0.14)";
  element.style.fontSize = "10px";
  element.style.fontWeight = "700";
  element.style.letterSpacing = "0.08em";
  if (title) {
    element.title = title;
    element.setAttribute("aria-label", title);
  }

  return element;
}

function createRouteBadge({
  totalMin,
  summary,
  title,
  variant,
  onClick,
}: {
  totalMin: number;
  summary: string;
  title?: string;
  variant: "active" | "alternate";
  onClick?: () => void;
}) {
  const element = document.createElement("button");

  element.type = "button";
  element.style.display = "flex";
  element.style.flexDirection = "column";
  element.style.alignItems = "flex-start";
  element.style.gap = "2px";
  element.style.padding = "8px 10px";
  element.style.borderRadius = "14px";
  element.style.border =
    variant === "active"
      ? "1px solid rgba(36, 91, 219, 0.22)"
      : "1px solid rgba(18, 32, 51, 0.12)";
  element.style.background =
    variant === "active" ? "rgba(255,255,255,0.985)" : "rgba(255,255,255,0.96)";
  element.style.boxShadow =
    variant === "active"
      ? "0 14px 32px rgba(17, 34, 51, 0.18)"
      : "0 10px 24px rgba(17, 34, 51, 0.14)";
  element.style.minWidth = "78px";
  element.style.cursor = onClick ? "pointer" : "default";

  const time = document.createElement("span");
  time.textContent = `${totalMin} min`;
  time.style.fontSize = variant === "active" ? "14px" : "13px";
  time.style.fontWeight = "700";
  time.style.color = variant === "active" ? "#245bdb" : "#122033";

  const detail = document.createElement("span");
  detail.textContent = summary;
  detail.style.fontSize = "10px";
  detail.style.fontWeight = "600";
  detail.style.letterSpacing = "0.02em";
  detail.style.color =
    variant === "active" ? "rgba(36, 91, 219, 0.72)" : "rgba(18, 32, 51, 0.68)";

  element.append(time, detail);

  if (title) {
    element.title = title;
    element.setAttribute("aria-label", title);
  }

  if (onClick) {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
  }

  return element;
}

function getRouteCoordinates({
  route,
  placeList,
  transitLegById,
  surfaceGeometryByLegId,
}: {
  route: PlannerPlan["recommendedRoute"];
  placeList: PlannerPlan["placeList"];
  transitLegById: Map<string, MtaTransitLegIntel>;
  surfaceGeometryByLegId: Map<string, RouteSurfaceLegGeometry>;
}) {
  return route.legs.flatMap((leg, index) => {
    const coordinates = getLegCoordinates({
      leg,
      placeList,
      transitLegById,
      surfaceGeometryByLegId,
    });

    return index === 0 ? coordinates : coordinates.slice(1);
  });
}

function buildRouteFeatures({
  route,
  placeList,
  transitLegById,
  surfaceGeometryByLegId,
  routeId = route.id,
  variant = "active",
}: {
  route: PlannerPlan["recommendedRoute"];
  placeList: PlannerPlan["placeList"];
  transitLegById: Map<string, MtaTransitLegIntel>;
  surfaceGeometryByLegId: Map<string, RouteSurfaceLegGeometry>;
  routeId?: string;
  variant?: "active" | "alternate";
}) {
  const lineFeatures = route.legs
    .map((leg) => {
      const coordinates = getLegCoordinates({
        leg,
        placeList,
        transitLegById,
        surfaceGeometryByLegId,
      });

      if (coordinates.length < 2) {
        return null;
      }

      return {
        type: "Feature" as const,
        properties: {
          mode: leg.mode,
          routeId,
          variant,
        },
        geometry: {
          type: "LineString" as const,
          coordinates,
        },
      };
    })
    .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature));
  const lineGhostFeatures =
    variant === "active"
      ? route.legs
          .map((leg) => {
            const liveTransitLeg = transitLegById.get(leg.id);

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
                routeId,
                variant,
              },
              geometry: {
                type: "LineString" as const,
                coordinates: liveTransitLeg.geometry.fullCoordinates,
              },
            };
          })
          .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature))
      : [];

  return { lineFeatures, lineGhostFeatures };
}

function getLegCoordinates({
  leg,
  placeList,
  transitLegById,
  surfaceGeometryByLegId,
}: {
  leg: PlannerPlan["recommendedRoute"]["legs"][number];
  placeList: PlannerPlan["placeList"];
  transitLegById: Map<string, MtaTransitLegIntel>;
  surfaceGeometryByLegId: Map<string, RouteSurfaceLegGeometry>;
}) {
  const from = getPlaceById(leg.fromPlaceId, placeList);
  const to = getPlaceById(leg.toPlaceId, placeList);

  if (leg.mode === "transit") {
    return transitLegById.get(leg.id)?.geometry?.coordinates ?? [];
  }

  return (
    surfaceGeometryByLegId.get(leg.id)?.coordinates ?? [
      [from?.lng ?? -73.98, from?.lat ?? 40.75],
      [to?.lng ?? -73.98, to?.lat ?? 40.75],
    ]
  );
}

function getMidpointCoordinate(coordinates: Array<[number, number]>) {
  if (coordinates.length === 0) {
    return null;
  }

  return coordinates[Math.floor(coordinates.length / 2)] ?? null;
}

function getRouteBadgeCoordinate(
  coordinates: Array<[number, number]>,
  fraction: number,
) {
  if (coordinates.length === 0) {
    return null;
  }

  if (coordinates.length === 1) {
    return coordinates[0];
  }

  const clampedFraction = Math.min(0.9, Math.max(0.1, fraction));
  const targetIndex = Math.round((coordinates.length - 1) * clampedFraction);

  return coordinates[targetIndex] ?? getMidpointCoordinate(coordinates);
}

function formatAlternateRouteSummary(
  route: PlannerPlan["recommendedRoute"],
  transitLegs?: MtaTransitLegIntel[],
) {
  return route.legs
    .map((leg) => {
      if (leg.mode === "transit") {
        const transitLabel = transitLegs
          ?.find((transitLeg) => transitLeg.legId === leg.id)
          ?.lines.map((line) => line.shortName)
          .join("/");

        return transitLabel || leg.lineName || "Train";
      }

      if (leg.mode === "bus") {
        return leg.lineName || "Bus";
      }

      if (leg.mode === "shared_micromobility") {
        return "Citi Bike";
      }

      return leg.mode === "walk" ? "Walk" : "Ride";
    })
    .join(" • ");
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: Pick<BikeParkingSuggestion, "lat" | "lng">,
  to: Pick<BikeParkingSuggestion, "lat" | "lng">,
) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dedupeParkingSpots(parkingSpots: BikeParkingSuggestion[]) {
  const keptSpots: BikeParkingSuggestion[] = [];

  for (const parkingSpot of [...parkingSpots].sort(
    (left, right) => left.distanceMeters - right.distanceMeters,
  )) {
    const alreadyCovered = keptSpots.some(
      (keptSpot) =>
        keptSpot.role === parkingSpot.role &&
        distanceMeters(keptSpot, parkingSpot) < PARKING_MARKER_MIN_SPACING_METERS,
    );

    if (!alreadyCovered) {
      keptSpots.push(parkingSpot);
    }
  }

  return keptSpots;
}

function formatMetersAsWalkTime(distanceMeters: number) {
  const minutes = Math.max(1, Math.round(distanceMeters / 80));

  return `${minutes} min away`;
}

function formatSharedStationMarkerTitle(
  station: PlannerRouteMobilityContext["sharedStations"][number],
) {
  const action =
    station.role === "pickup" ? "Citi Bike pickup" : "Citi Bike return";
  const availability =
    station.role === "pickup"
      ? `${station.bikesAvailable} bikes, ${station.ebikesAvailable} e-bikes, ${station.docksAvailable} docks open`
      : `${station.docksAvailable} docks open, ${station.bikesAvailable} bikes at station`;

  return `${action}: ${station.name}. ${availability}. ${formatMetersAsWalkTime(station.distanceMeters)}.`;
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
  const visiblePlaces = plan.placeList.filter((place) => visiblePlaceIds.includes(place.id));
  const routeStartPlaceId = activeRoute.legs[0]?.fromPlaceId;
  const routeEndPlaceId = activeRoute.legs[activeRoute.legs.length - 1]?.toPlaceId;
  const lats = visiblePlaces.map((place) => place.lat);
  const lngs = visiblePlaces.map((place) => place.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  function project(placeId: string) {
    const place = getPlaceById(placeId, plan.placeList);

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
          const isOrigin = place.id === routeStartPlaceId;
          const isDestination = place.id === routeEndPlaceId;

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
