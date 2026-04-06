import { NextRequest, NextResponse } from "next/server";
import {
  getMicromobilityContextForRoute,
  getPlannerMicromobilityContext,
} from "@/lib/micromobility/context";
import type { PlannerRouteRequest } from "@/lib/planner/payload";
import { stableStringify, withServerCache } from "@/lib/server-cache";

export async function GET(request: NextRequest) {
  const routeId = request.nextUrl.searchParams.get("routeId");
  const originLat = request.nextUrl.searchParams.get("originLat");
  const originLng = request.nextUrl.searchParams.get("originLng");
  const destinationLat = request.nextUrl.searchParams.get("destinationLat");
  const destinationLng = request.nextUrl.searchParams.get("destinationLng");

  if (!routeId) {
    return NextResponse.json(
      { error: "Missing routeId query parameter." },
      { status: 400 },
    );
  }

  try {
    const context = await withServerCache(
      "micromobility-context:get",
      stableStringify({
        routeId,
        originLat,
        originLng,
        destinationLat,
        destinationLng,
      }),
      () =>
        getPlannerMicromobilityContext(routeId, {
          origin:
            originLat && originLng
              ? {
                  lat: Number(originLat),
                  lng: Number(originLng),
                }
              : undefined,
          destination:
            destinationLat && destinationLng
              ? {
                  lat: Number(destinationLat),
                  lng: Number(destinationLng),
                }
              : undefined,
        }),
    );

    return NextResponse.json(context, {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to resolve micromobility context.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as PlannerRouteRequest;

    if (!payload.route || !payload.placeList) {
      return NextResponse.json(
        { error: "Missing route payload." },
        { status: 400 },
      );
    }

    const context = await withServerCache(
      "micromobility-context:post",
      stableStringify(payload),
      () =>
        getMicromobilityContextForRoute(
          payload.route,
          payload.placeList,
        ),
    );

    return NextResponse.json(context, {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to resolve micromobility context.",
      },
      { status: 500 },
    );
  }
}
