import { NextResponse } from "next/server";
import { SURF_ENABLED_SPORT_KEYS } from "@/lib/surf/sports";

export async function GET() {
  return NextResponse.json(
    {
      error: "NBA market polling is disabled for the NFL-first launch.",
      enabledSports: SURF_ENABLED_SPORT_KEYS,
    },
    { status: 410 },
  );
}
