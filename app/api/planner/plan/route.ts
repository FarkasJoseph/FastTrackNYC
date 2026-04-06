import { NextRequest, NextResponse } from "next/server";
import { buildComputedPlannerPlan } from "@/lib/planner/route-engine";
import type { PlannerPlanRequest } from "@/lib/planner/payload";
import { stableStringify, withServerCache } from "@/lib/server-cache";

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as PlannerPlanRequest;

    if (!payload.origin || !payload.destination || !payload.preferences) {
      return NextResponse.json(
        { error: "Missing planner request payload." },
        { status: 400 },
      );
    }

    const plan = await withServerCache(
      "planner-plan",
      stableStringify(payload),
      () =>
        buildComputedPlannerPlan(
          payload.origin,
          payload.destination,
          payload.preferences,
        ),
    );

    return NextResponse.json(plan, {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to compute planner routes.",
      },
      { status: 500 },
    );
  }
}
