import { NextRequest, NextResponse } from "next/server";
import { getPlannerRouteIntel } from "@/lib/mta/route-intel";

export async function GET(request: NextRequest) {
  const routeId = request.nextUrl.searchParams.get("routeId");

  if (!routeId) {
    return NextResponse.json(
      { error: "Missing routeId query parameter." },
      { status: 400 },
    );
  }

  try {
    const intel = await getPlannerRouteIntel(routeId);
    return NextResponse.json(intel, {
      headers: {
        "Cache-Control": "no-store",
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
