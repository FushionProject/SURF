import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "NBA market polling is disabled for the NFL-first launch.",
      enabledSports: ["americanfootball_nfl_preseason", "americanfootball_nfl", "baseball_mlb"],
    },
    { status: 410 },
  );
}
