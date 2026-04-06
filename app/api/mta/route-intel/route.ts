import { NextRequest, NextResponse } from "next/server";
import { getPlannerRouteIntel, getRouteIntelForRoute } from "@/lib/mta/route-intel";
import type { PlannerRouteRequest } from "@/lib/planner/payload";
import { stableStringify, withServerCache } from "@/lib/server-cache";

export async function GET(request: NextRequest) {
  const routeId = request.nextUrl.searchParams.get("routeId");

  if (!routeId) {
    return NextResponse.json(
      { error: "Missing routeId query parameter." },
      { status: 400 },
    );
  }

  try {
    const intel = await withServerCache("mta-route-intel:get", routeId, () =>
      getPlannerRouteIntel(routeId),
    );
    return NextResponse.json(intel, {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to resolve route intel.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as PlannerRouteRequest;

    if (!payload.route) {
      return NextResponse.json(
        { error: "Missing route payload." },
        { status: 400 },
      );
    }

    const intel = await withServerCache(
      "mta-route-intel:post",
      stableStringify(payload),
      () => getRouteIntelForRoute(payload.route),
    );
    return NextResponse.json(intel, {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to resolve route intel.",
      },
      { status: 500 },
    );
  }
}
