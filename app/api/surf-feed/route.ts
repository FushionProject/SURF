import { NextResponse } from "next/server";

import type { OddsApiGame } from "@/lib/surf/types";
import type { SignalCard } from "@/lib/surf/types";
import { formatSignalCards } from "@/lib/surf/format";
import { classifyTopSignal, debugSurfSignals, detectSurfSignals } from "@/lib/surf/signals";
import {
  computeGameMarketContext,
  currentConsensusFromStore,
  lastChangedAtFromStore,
  marketContextGameKey,
  recentConsensusMovement,
} from "@/lib/surf/marketContext";
import {
  computeSignalStrengthScore,
  getSignalTitle,
  getWhyItMatters,
  topBadgeLabel,
} from "@/lib/surf/signalCopy";

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

const TOP_SIGNAL_THRESHOLD = 1.5;

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function formatNumber(value: number): string {
  const v = roundToHalf(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}`;
}

function asStrongContextMovementCards(games: OddsApiGame[]): SignalCard[] {
  const ctx = computeGameMarketContext(games);
  const out: SignalCard[] = [];

  for (const g of games) {
    const gc = ctx[g.id];
    const pick =
      (gc?.totals && typeof gc.totals.delta === "number" ? { market: "totals" as const, c: gc.totals } : undefined) ??
      (gc?.spreads && typeof gc.spreads.delta === "number" ? { market: "spreads" as const, c: gc.spreads } : undefined);

    if (!pick) continue;
    const open = pick.c.openLine;
    const current = pick.c.currentLine;
    if (typeof open !== "number" || !Number.isFinite(open)) continue;
    if (typeof current !== "number" || !Number.isFinite(current)) continue;

    const lineMovement = Math.abs(current - open);
    if (!Number.isFinite(lineMovement) || lineMovement < TOP_SIGNAL_THRESHOLD) continue;

    const label = pick.market === "totals" ? "Total:" : "Spread:";
    const detail = `${label} ${formatNumber(open)} → ${formatNumber(current)}`;

    out.push({
      id: `CTX_MOVEMENT:${g.id}:${pick.market}`,
      game: {
        id: g.id,
        league: "NBA",
        homeTeam: g.home_team,
        awayTeam: g.away_team,
      },
      signalType: "Market Movement",
      market: pick.market,
      title: "Market moved",
      detail,
      insight: "Tracked move from open to current consensus.",
      commenceTime: g.commence_time,
      lineMovement,
    });
  }

  return out;
}

function pickRecentWindowMinutes(): number {
  return 20;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function enrichSignals(signals: SignalCard[], games: OddsApiGame[]) {
  const byId = new Map<string, OddsApiGame>();
  for (const g of games) byId.set(g.id, g);

  const now = Date.now();
  const windowMinutes = pickRecentWindowMinutes();

  return signals.map((s) => {
    const g = byId.get(s.game.id);
    const market = s.market;
    const key = g ? marketContextGameKey(g) : undefined;

    let currentConsensus: number | undefined;
    if (key && market) {
      currentConsensus = currentConsensusFromStore({ gameKey: key, market });
    }

    // Fallback: infer it from open→current detail where possible.
    // This remains safe and time-based because the snapshot history itself is derived from consensus over time.
    if (currentConsensus == null && typeof s.detail === "string") {
      const matches = s.detail.match(/[+-]?\d+(?:\.\d+)?/g);
      if (matches && matches.length >= 2) {
        const b = Number(matches[1]);
        if (Number.isFinite(b)) currentConsensus = b;
      }
    }

    const recentWithCurrent =
      key && market
        ? recentConsensusMovement({
            gameKey: key,
            market,
            now,
            windowMinutes,
            currentConsensus,
          })
        : {};

    const recentDelta = recentWithCurrent.recentDelta;
    const recentAbs = isFiniteNumber(recentDelta) ? Math.abs(recentDelta) : undefined;
    const recentMinutes = recentWithCurrent.minutes;
    const lastMovedAt = key && market ? lastChangedAtFromStore({ gameKey: key, market }) : undefined;

    const strengthScore = computeSignalStrengthScore({
      gap: s.gap,
      lineMovement: s.lineMovement,
      recentMovementAbs: recentAbs,
    });

    const next: SignalCard = {
      ...s,
      title: getSignalTitle({ ...s, lineMovement: s.lineMovement }),
      insight: getWhyItMatters({ ...s, lineMovement: s.lineMovement }),
      recentMovement: recentDelta,
      recentMovementAbs: recentAbs,
      recentMovementMinutes: recentMinutes,
      recentMovementLabel: undefined,
      lastMovedAt,
      strengthScore,
    };

    const isTopSignal = classifyTopSignal(next);
    return {
      ...next,
      isTopSignal,
      topBadge: isTopSignal ? topBadgeLabel(next) : undefined,
    };
  });
}

function normalizeBookmakerKey(key: string): string {
  return key.trim().toLowerCase();
}

export async function GET(request: Request) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ODDS_API_KEY in environment" },
      { status: 500 }
    );
  }

  // NBA only for V1.
  // We request featured markets only: spreads + totals.
  const oddsUrl = new URL(`${ODDS_API_BASE}/sports/basketball_nba/odds`);
  oddsUrl.searchParams.set("apiKey", apiKey);
  oddsUrl.searchParams.set("regions", "us");
  oddsUrl.searchParams.set("markets", "spreads,totals");
  oddsUrl.searchParams.set("oddsFormat", "american");

  // Keep this simple: for a feed endpoint we only need upcoming games.
  oddsUrl.searchParams.set("dateFormat", "iso");

  const res = await fetch(oddsUrl.toString(), {
    method: "GET",
    // Avoid caching odds responses on the server.
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

  const games = raw as OddsApiGame[];

  const isDebug = new URL(request.url).searchParams.get("debug") === "1";

  // Surf V1 is pregame-only to avoid live market distortion and stale in-game book comparisons.
  // When debug is enabled, do NOT filter so we can inspect every game returned.
  const now = Date.now();
  const targetGames = isDebug
    ? games
    : games.filter((g) => {
        const t = new Date(g.commence_time).getTime();
        return Number.isFinite(t) && t > now;
      });

  const filteredGames: OddsApiGame[] = targetGames.map((g) => ({
    ...g,
    bookmakers: (g.bookmakers ?? []).filter((b) => CORE_BOOKMAKER_KEYS.has(normalizeBookmakerKey(b.key))),
  }));

  if (isDebug) {
    const includedBooks = new Map<string, string>();
    for (const game of filteredGames) {
      for (const b of game.bookmakers ?? []) {
        includedBooks.set(b.key, b.title);
      }
    }

    const { detections, debug } = debugSurfSignals(filteredGames);
    const signals = formatSignalCards(detections, filteredGames);
    const contextMoves = asStrongContextMovementCards(filteredGames);
    const byId = new Set(signals.map((s) => s.id));
    const mergedSignals = [...signals, ...contextMoves.filter((s) => !byId.has(s.id))];
    let loggedMovement = false;
    const taggedSignals = enrichSignals(mergedSignals, filteredGames).map((s) => {
      const isTopSignal = Boolean(s.isTopSignal);
      if (!loggedMovement && (s.signalType === "Line Movement" || s.signalType === "Market Movement")) {
        loggedMovement = true;
        console.log(
          JSON.stringify(
            {
              debugMovementSample: {
                id: s.id,
                signalType: s.signalType,
                detail: s.detail,
                gap: s.gap,
                lineMovement: s.lineMovement,
                recentMovementAbs: s.recentMovementAbs,
                strengthScore: s.strengthScore,
                isTopSignal,
              },
            },
            null,
            2
          )
        );
      }
      return { ...s, isTopSignal };
    });

    console.log(JSON.stringify({ surfDebug: debug }, null, 2));
    console.log(
      JSON.stringify(
        { coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })) },
        null,
        2
      )
    );

    return NextResponse.json({
      count: taggedSignals.length,
      signals: taggedSignals,
      debug,
      coreBooksIncluded: [...includedBooks.entries()].map(([key, title]) => ({ key, title })),
    });
  }

  // Safety: some responses may omit bookmakers or certain markets.
  const detections = detectSurfSignals(filteredGames);
  const signals = formatSignalCards(detections, filteredGames);
  const contextMoves = asStrongContextMovementCards(filteredGames);
  const byId = new Set(signals.map((s) => s.id));
  const mergedSignals = [...signals, ...contextMoves.filter((s) => !byId.has(s.id))];
  const taggedSignals = enrichSignals(mergedSignals, filteredGames);

  return NextResponse.json({
    count: taggedSignals.length,
    signals: taggedSignals,
  });
}
