import { NextResponse } from "next/server";

import { getNbaOddsSnapshot } from "@/lib/surf/nbaOddsScheduler";
import type { NbaRefreshMode } from "@/lib/surf/nbaOddsScheduler";

function parseMode(value: string | null): NbaRefreshMode {
  if (value === "fixed15") return "fixed15";
  if (value === "manual") return "manual";
  return "dynamic";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";
  const mode = parseMode(url.searchParams.get("refreshMode"));

  try {
    const snapshot = await getNbaOddsSnapshot({ mode, debug });
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
