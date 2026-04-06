import { NextRequest, NextResponse } from "next/server";
import { searchLocationAutocomplete } from "@/lib/mapbox/search";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";

  if (query.trim().length < 2) {
    return NextResponse.json(
      { options: [] },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const options = await searchLocationAutocomplete(query);

    return NextResponse.json(
      { options },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load location suggestions.",
      },
      { status: 500 },
    );
  }
}
