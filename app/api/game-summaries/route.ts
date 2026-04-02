import { NextResponse } from "next/server";

import type { OddsApiGame, SurfSignalDetection } from "@/lib/surf/types";
import { detectSurfSignals } from "@/lib/surf/signals";
import type { GameMarketContext } from "@/lib/surf/marketContext";
import { computeGameMarketContext, marketContextGameKey } from "@/lib/surf/marketContext";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const CORE_BOOKMAKER_KEYS = new Set([
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "espnbet",
  "espn_bet",
  "bet365",
  "fanatics",
  "betrivers",
]);

function normalizeBookmakerKey(key: string): string {
  return key.trim().toLowerCase();
}

export type GameSummariesResponse = {
  count: number;
  games: OddsApiGame[];
  detections: SurfSignalDetection[];
  marketContext: Record<string, GameMarketContext>;
  coreBooksIncluded: Array<{ key: string; title: string }>;
};

export async function GET(request: Request) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ODDS_API_KEY in environment" },
      { status: 500 }
    );
  }

  const oddsUrl = new URL(`${ODDS_API_BASE}/sports/basketball_nba/odds`);
  oddsUrl.searchParams.set("apiKey", apiKey);
  oddsUrl.searchParams.set("regions", "us");
  oddsUrl.searchParams.set("markets", "spreads,totals");
  oddsUrl.searchParams.set("oddsFormat", "american");
  oddsUrl.searchParams.set("dateFormat", "iso");

  const res = await fetch(oddsUrl.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Failed to fetch odds",
        status: res.status,
        body: text,
      },
      { status: 502 }
    );
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Odds API returned invalid JSON" },
      { status: 502 }
    );
  }

  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "Unexpected Odds API response shape" },
      { status: 502 }
    );
  }

  const isDebug = new URL(request.url).searchParams.get("debug") === "1";

  const games = raw as OddsApiGame[];

  const now = Date.now();
  const upcomingGames = games.filter((g) => {
    const t = new Date(g.commence_time).getTime();
    return Number.isFinite(t) && t > now;
  });

  const filteredGames: OddsApiGame[] = upcomingGames.map((g) => ({
    ...g,
    bookmakers: (g.bookmakers ?? []).filter((b) => CORE_BOOKMAKER_KEYS.has(normalizeBookmakerKey(b.key))),
  }));

  const includedBooks = new Map<string, string>();
  for (const game of filteredGames) {
    for (const b of game.bookmakers ?? []) {
      includedBooks.set(b.key, b.title);
    }
  }

  const detections = detectSurfSignals(filteredGames);
  const marketContext = computeGameMarketContext(filteredGames);

  if (isDebug) {
    const debugOpenSnapshots = filteredGames.map((g) => {
      const key = marketContextGameKey(g);
      const ctx = marketContext[g.id];
      return {
        gameKey: key,
        gameId: g.id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        commenceTime: g.commence_time,
        totals: ctx?.totals
          ? {
              openTotalConsensus: ctx.totals.openLine ?? null,
              currentTotalConsensus: ctx.totals.currentLine ?? null,
              firstSeenAt: new Date(ctx.totals.firstSeenAt).toISOString(),
              updatedAt: new Date(ctx.totals.lastSeenAt).toISOString(),
            }
          : null,
        spreads: ctx?.spreads
          ? {
              openSpreadConsensusHome: ctx.spreads.openLine ?? null,
              currentSpreadConsensusHome: ctx.spreads.currentLine ?? null,
              firstSeenAt: new Date(ctx.spreads.firstSeenAt).toISOString(),
              updatedAt: new Date(ctx.spreads.lastSeenAt).toISOString(),
            }
          : null,
      };
    });

    console.log(JSON.stringify({ gameSummaryMarketContextDebug: debugOpenSnapshots }, null, 2));
    console.log(
      JSON.stringify(
        { coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })) },
        null,
        2
      )
    );
  }

  const payload: GameSummariesResponse = {
    count: filteredGames.length,
    games: filteredGames,
    detections,
    marketContext,
    coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })),
  };

  return NextResponse.json(payload);
}
