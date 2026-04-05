import { NextRequest, NextResponse } from "next/server";
import { getPlannerRouteSurfaceGeometry } from "@/lib/mapbox/route-surface";

export async function GET(request: NextRequest) {
  const routeId = request.nextUrl.searchParams.get("routeId");

  if (!routeId) {
    return NextResponse.json(
      { error: "Missing routeId query parameter." },
      { status: 400 },
    );
  }

  try {
    const geometry = await getPlannerRouteSurfaceGeometry(routeId);

    return NextResponse.json(geometry, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to resolve route surface geometry.",
      },
      { status: 500 },
    );
  }
}
