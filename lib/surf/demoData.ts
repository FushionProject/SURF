import type { GameMarketAverage } from "@/lib/surf/marketAverage";
import type { GameMarketContext } from "@/lib/surf/marketContext";
import { marketContextGameKey } from "@/lib/surf/marketContext";
import { classifyTopSignal } from "@/lib/surf/signals";
import type { OddsApiBookmaker, OddsApiGame, SignalCard, SurfSignalDetection } from "@/lib/surf/types";

export type SurfDataSource = "demo" | "fallback";

export type SurfDemoMetadata = {
  dataSource: SurfDataSource;
  isSimulated: true;
  dataLabel: "Simulated Data";
  dataNotice: string;
  sportKey: "baseball_mlb";
};

const BOOKS = [
  ["draftkings", "DraftKings"],
  ["fanduel", "FanDuel"],
  ["betmgm", "BetMGM"],
  ["caesars", "Caesars"],
  ["bet365", "bet365"],
  ["fanatics", "Fanatics"],
] as const;

const DEMO_NOTICE = "Betting lines, prices, and movements are simulated for product demonstration only.";

type DemoGameConfig = {
  id: string;
  away: string;
  home: string;
  hoursFromNow: number;
  openTotal: number;
  currentTotal: number;
  peakTotal?: number;
  openHomeRunLine: number;
  currentHomeRunLine: number;
  openTotalPrice: number;
  currentTotalPrice: number;
  openRunLinePrice: number;
  currentRunLinePrice: number;
  totalPoints?: number[];
  runLinePoints?: number[];
};

const GAME_CONFIGS: DemoGameConfig[] = [
  {
    id: "demo-mlb-sea-nyy",
    away: "Seattle Mariners",
    home: "New York Yankees",
    hoursFromNow: 1,
    openTotal: 8,
    currentTotal: 9.5,
    openHomeRunLine: -1.5,
    currentHomeRunLine: -1.5,
    openTotalPrice: -105,
    currentTotalPrice: -118,
    openRunLinePrice: +125,
    currentRunLinePrice: +112,
  },
  {
    id: "demo-mlb-bos-tor",
    away: "Boston Red Sox",
    home: "Toronto Blue Jays",
    hoursFromNow: 2,
    openTotal: 8.5,
    currentTotal: 8.5,
    openHomeRunLine: +1.5,
    currentHomeRunLine: +1.5,
    openTotalPrice: -110,
    currentTotalPrice: -108,
    openRunLinePrice: -125,
    currentRunLinePrice: -145,
  },
  {
    id: "demo-mlb-lad-sf",
    away: "Los Angeles Dodgers",
    home: "San Francisco Giants",
    hoursFromNow: 3,
    openTotal: 8,
    currentTotal: 8.5,
    openHomeRunLine: +1.5,
    currentHomeRunLine: +1.5,
    openTotalPrice: -105,
    currentTotalPrice: -115,
    openRunLinePrice: -135,
    currentRunLinePrice: -122,
    totalPoints: [7.5, 8.5, 8.5, 9, 7.5, 8.5],
  },
  {
    id: "demo-mlb-chc-stl",
    away: "Chicago Cubs",
    home: "St. Louis Cardinals",
    hoursFromNow: 4,
    openTotal: 8.5,
    currentTotal: 8.5,
    openHomeRunLine: +1.5,
    currentHomeRunLine: +1.5,
    openTotalPrice: -110,
    currentTotalPrice: -110,
    openRunLinePrice: -128,
    currentRunLinePrice: -130,
    runLinePoints: [+1.5, +1.5, +1.5, +1.5, +1.5, -1.5],
  },
  {
    id: "demo-mlb-atl-nym",
    away: "Atlanta Braves",
    home: "New York Mets",
    hoursFromNow: 5,
    openTotal: 8,
    currentTotal: 8.5,
    openHomeRunLine: -1.5,
    currentHomeRunLine: -1.5,
    openTotalPrice: -108,
    currentTotalPrice: -116,
    openRunLinePrice: +135,
    currentRunLinePrice: +120,
  },
  {
    id: "demo-mlb-hou-tex",
    away: "Houston Astros",
    home: "Texas Rangers",
    hoursFromNow: 6,
    openTotal: 9,
    currentTotal: 8.5,
    openHomeRunLine: +1.5,
    currentHomeRunLine: +1.5,
    openTotalPrice: -105,
    currentTotalPrice: -112,
    openRunLinePrice: -118,
    currentRunLinePrice: -112,
  },
  {
    id: "demo-mlb-cle-det",
    away: "Cleveland Guardians",
    home: "Detroit Tigers",
    hoursFromNow: 7,
    openTotal: 7.5,
    currentTotal: 8,
    openHomeRunLine: -1.5,
    currentHomeRunLine: -1.5,
    openTotalPrice: -115,
    currentTotalPrice: -105,
    openRunLinePrice: +145,
    currentRunLinePrice: +132,
  },
  {
    id: "demo-mlb-sd-ari",
    away: "San Diego Padres",
    home: "Arizona Diamondbacks",
    hoursFromNow: 8,
    openTotal: 8,
    currentTotal: 8,
    openHomeRunLine: +1.5,
    currentHomeRunLine: +1.5,
    openTotalPrice: -110,
    currentTotalPrice: -109,
    openRunLinePrice: -120,
    currentRunLinePrice: -118,
  },
];

function metadata(dataSource: SurfDataSource): SurfDemoMetadata {
  return {
    dataSource,
    isSimulated: true,
    dataLabel: "Simulated Data",
    dataNotice: DEMO_NOTICE,
    sportKey: "baseball_mlb",
  };
}

function demoTime(hoursFromNow: number): string {
  const now = Date.now();
  return new Date(now + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function buildBookmakers(config: DemoGameConfig, commenceTime: string): OddsApiBookmaker[] {
  return BOOKS.map(([key, title], index) => {
    const total = config.totalPoints?.[index] ?? config.currentTotal;
    const homePoint = config.runLinePoints?.[index] ?? config.currentHomeRunLine;
    const totalPriceOffset = [-3, 2, 0, 4, -1, 1][index] ?? 0;
    const runPriceOffset = [3, -2, 0, 5, -4, 1][index] ?? 0;
    const lastUpdate = new Date(new Date(commenceTime).getTime() - (18 - index * 2) * 60 * 1000).toISOString();

    return {
      key,
      title,
      last_update: lastUpdate,
      markets: [
        {
          key: "totals",
          last_update: lastUpdate,
          outcomes: [
            { name: "Over", point: total, price: config.currentTotalPrice + totalPriceOffset },
            { name: "Under", point: total, price: -110 - totalPriceOffset },
          ],
        },
        {
          key: "spreads",
          last_update: lastUpdate,
          outcomes: [
            { name: config.home, point: homePoint, price: config.currentRunLinePrice + runPriceOffset },
            { name: config.away, point: -homePoint, price: -110 - runPriceOffset },
          ],
        },
      ],
    };
  });
}

function buildGames(): OddsApiGame[] {
  return GAME_CONFIGS.map((config) => {
    const commenceTime = demoTime(config.hoursFromNow);
    return {
      id: config.id,
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: commenceTime,
      home_team: config.home,
      away_team: config.away,
      bookmakers: buildBookmakers(config, commenceTime),
    };
  });
}

function signal(
  value: Omit<SignalCard, "game" | "commenceTime" | "isTopSignal"> & { gameId: string }
): SignalCard {
  const config = GAME_CONFIGS.find((game) => game.id === value.gameId);
  if (!config) throw new Error(`Unknown SURF demo game: ${value.gameId}`);
  const card: SignalCard = {
    ...value,
    game: {
      id: config.id,
      league: "MLB",
      sportKey: "baseball_mlb",
      sportLabel: "MLB",
      awayTeam: config.away,
      homeTeam: config.home,
    },
    commenceTime: demoTime(config.hoursFromNow),
  };
  delete (card as SignalCard & { gameId?: string }).gameId;
  return { ...card, isTopSignal: classifyTopSignal(card) };
}

export function isSurfDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_SURF_DEMO_MODE === "true";
}

export function getDemoSurfFeed(dataSource: SurfDataSource) {
  const now = Date.now();
  const signals: SignalCard[] = [
    signal({
      id: "demo-price-pressure",
      gameId: "demo-mlb-sea-nyy",
      signalType: "Price Pressure",
      market: "totals",
      title: "Two books tightened the price on Over",
      detail: "-110 → -125 at 8.5",
      insight: "The total stayed at 8.5 while the Over became more expensive—a real price adjustment, not a projected move.",
      sources: [
        { label: "Price moved", book: "DraftKings", value: "-110 → -125" },
        { label: "Price moved", book: "FanDuel", value: "-108 → -122" },
      ],
      valueOptions: [
        { selection: "Over", book: "bet365", line: "8.5", price: "-112" },
        { selection: "Under", book: "Caesars", line: "8.5", price: "+105" },
      ],
      lastMovedAt: now - 7 * 60_000,
      detectedAt: now - 7 * 60_000,
      signalChangedAt: now - 7 * 60_000,
      strengthScore: 86,
      marketHorizon: {
        kind: "price_pressure",
        confidence: "confirmed",
        usefulnessScore: 86,
        usefulnessReasons: [
          "Two books changed the price without changing the total.",
          "The largest implied-probability change was 3.2 percentage points.",
        ],
        facts: [
          { label: "DraftKings · Price moved", value: "-110 → -125" },
          { label: "FanDuel · Price moved", value: "-108 → -122" },
        ],
        advancedFacts: [
          "Six books in the current sample.",
          "Two books changed the price without changing the total.",
          "Sportsbook update timestamps advanced for the recorded evidence.",
          DEMO_NOTICE,
        ],
      },
    }),
    signal({
      id: "demo-consensus-shift",
      gameId: "demo-mlb-bos-tor",
      signalType: "Consensus Shift",
      market: "totals",
      title: "The total consensus moved",
      detail: "8 → 8.5",
      insight: "Six books were sampled and 8.5 is now the supported consensus.",
      sources: [
        { label: "Line moved", book: "DraftKings", value: "8 → 8.5" },
        { label: "Line moved", book: "BetMGM", value: "8 → 8.5" },
      ],
      valueOptions: [
        { selection: "Over", book: "Fanatics", line: "8", price: "-120" },
        { selection: "Under", book: "Caesars", line: "8.5", price: "-105" },
      ],
      lastMovedAt: now - 18 * 60_000,
      detectedAt: now - 18 * 60_000,
      signalChangedAt: now - 18 * 60_000,
      lineMovement: 0.5,
      strengthScore: 78,
      marketHorizon: {
        kind: "consensus_shift",
        confidence: "confirmed",
        usefulnessScore: 78,
        usefulnessReasons: [
          "The consensus changed by 0.5 points.",
          "Four books currently show the new consensus.",
        ],
        facts: [
          { label: "DraftKings · Line moved", value: "8 → 8.5" },
          { label: "BetMGM · Line moved", value: "8 → 8.5" },
        ],
        advancedFacts: [
          "Six books in the current sample.",
          "Four books currently show the new consensus.",
          "Sportsbook update timestamps advanced for the recorded evidence.",
          DEMO_NOTICE,
        ],
      },
    }),
    signal({
      id: "demo-market-resolution",
      gameId: "demo-mlb-lad-sf",
      signalType: "Market Resolution",
      market: "totals",
      title: "Books closed a 1.5-point total split",
      detail: "Range 1.5 → 0.5",
      insight: "A previously meaningful book split closed, so the earlier outlier is no longer available.",
      lastMovedAt: now - 31 * 60_000,
      detectedAt: now - 31 * 60_000,
      signalChangedAt: now - 31 * 60_000,
      strengthScore: 82,
      sources: [
        { label: "Line moved", book: "Caesars", value: "9 → 8.5" },
      ],
      marketHorizon: {
        kind: "market_resolution",
        confidence: "confirmed",
        usefulnessScore: 82,
        usefulnessReasons: [
          "The book range contracted by 1.5 points.",
          "The market is now within 0.5 points.",
        ],
        facts: [{ label: "Caesars · Line moved", value: "9 → 8.5" }],
        advancedFacts: [
          "Six books in the current sample.",
          "The book range contracted by 1.5 points.",
          "The market is now within 0.5 points.",
          DEMO_NOTICE,
        ],
      },
    }),
    signal({
      id: "demo-useful-current-split",
      gameId: "demo-mlb-chc-stl",
      signalType: "Book Disagreement",
      market: "totals",
      title: "Books are 1.5 points apart on the total",
      detail: "7.5 to 9",
      insight: DEMO_NOTICE,
      gap: 1.5,
      detectedAt: now - 3 * 60_000,
      signalChangedAt: now - 3 * 60_000,
      strengthScore: 50,
      sources: [
        { label: "Lower", book: "DraftKings", value: "7.5" },
        { label: "Higher", book: "Caesars", value: "9" },
      ],
      valueOptions: [
        { selection: "Over", book: "DraftKings", line: "7.5", price: "-115" },
        { selection: "Under", book: "Caesars", line: "9", price: "-110" },
      ],
    }),
  ].sort((a, b) => (b.strengthScore ?? 0) - (a.strengthScore ?? 0));

  return {
    count: signals.length,
    signals,
    sportLabel: "MLB" as const,
    ...metadata(dataSource),
  };
}

function makeDetection(config: DemoGameConfig): SurfSignalDetection[] {
  const movement = Math.abs(config.currentTotal - config.openTotal);
  if (movement < 0.5) return [];
  return [
    {
      type: "SNAPSHOT_MOVEMENT",
      gameId: config.id,
      market: "totals",
      commenceTime: demoTime(config.hoursFromNow),
      booksInSample: BOOKS.length,
      range: 0.5,
      baselinePoint: config.openTotal,
      movedPoint: config.currentTotal,
      movementSeverity: movement >= 1.5 ? "SHARP_MOVEMENT" : "LINE_MOVED",
    },
  ];
}

export function getDemoGameSummaries(dataSource: SurfDataSource) {
  const games = buildGames();
  const detections = GAME_CONFIGS.flatMap(makeDetection);
  const now = Date.now();

  const marketContext: Record<string, GameMarketContext> = {};
  const marketAverage: Record<string, GameMarketAverage> = {};
  const openingSnapshot: Record<string, { spreads?: number; totals?: number }> = {};
  const openingMedianSnapshot: Record<string, { spreads?: number; totals?: number }> = {};
  const openingMedianPriceSnapshot: Record<
    string,
    { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }
  > = {};
  const currentMedianSnapshot: Record<string, { spreads?: number; totals?: number }> = {};
  const currentMedianPriceSnapshot: Record<
    string,
    { spreads?: { home?: number; away?: number }; totals?: { over?: number; under?: number } }
  > = {};

  for (const config of GAME_CONFIGS) {
    const game = games.find((candidate) => candidate.id === config.id)!;
    const changedAt = now - 12 * 60 * 1000;
    marketContext[config.id] = {
      totals: {
        market: "totals",
        openLine: config.openTotal,
        currentLine: config.currentTotal,
        delta: config.currentTotal - config.openTotal,
        range: config.totalPoints ? Math.max(...config.totalPoints) - Math.min(...config.totalPoints) : 0.5,
        booksInSample: BOOKS.length,
        firstSeenAt: now - 6 * 60 * 60 * 1000,
        lastSeenAt: now,
        lastChangedAt: changedAt,
        changeCount: config.currentTotal === config.openTotal ? 0 : 1,
        observedCount: 4,
      },
      spreads: {
        market: "spreads",
        openLine: config.openHomeRunLine,
        currentLine: config.currentHomeRunLine,
        delta: config.currentHomeRunLine - config.openHomeRunLine,
        range: config.runLinePoints ? Math.max(...config.runLinePoints) - Math.min(...config.runLinePoints) : 0,
        booksInSample: BOOKS.length,
        firstSeenAt: now - 6 * 60 * 60 * 1000,
        lastSeenAt: now,
        lastChangedAt: changedAt,
        changeCount: config.currentHomeRunLine === config.openHomeRunLine ? 0 : 1,
        observedCount: 4,
      },
    };

    const peakTotal = config.peakTotal ?? config.currentTotal;
    marketAverage[config.id] = {
      gameKey: marketContextGameKey(game),
      openSpreadAvg: config.openHomeRunLine,
      currentSpreadAvg: config.currentHomeRunLine,
      peakSpreadAvg: config.currentHomeRunLine,
      openTotalAvg: config.openTotal,
      currentTotalAvg: config.currentTotal,
      peakTotalAvg: peakTotal,
      lastMovedAt: config.currentTotal === config.openTotal ? null : new Date(changedAt).toISOString(),
      spreadHistory: [],
      totalHistory: [],
    };

    openingSnapshot[config.id] = { spreads: config.openHomeRunLine, totals: config.openTotal };
    openingMedianSnapshot[config.id] = { spreads: config.openHomeRunLine, totals: config.openTotal };
    currentMedianSnapshot[config.id] = { spreads: config.currentHomeRunLine, totals: config.currentTotal };
    openingMedianPriceSnapshot[config.id] = {
      spreads: { home: config.openRunLinePrice, away: -110 },
      totals: { over: config.openTotalPrice, under: -110 },
    };
    currentMedianPriceSnapshot[config.id] = {
      spreads: { home: config.currentRunLinePrice, away: -110 },
      totals: { over: config.currentTotalPrice, under: -110 },
    };
  }

  return {
    sportLabel: "MLB" as const,
    count: games.length,
    games,
    detections,
    marketContext,
    marketAverage,
    nbaHistoricalMarketMovement: {},
    openingSnapshot,
    openingMedianSnapshot,
    openingMedianPriceSnapshot,
    currentMedianSnapshot,
    currentMedianPriceSnapshot,
    coreBooksIncluded: BOOKS.map(([key, title]) => ({ key, title })),
    injuries: {
      source: "api-sports" as const,
      status: "not_applicable" as const,
      injuriesByTeam: {},
      coveredTeams: [],
      missingTeams: [],
    },
    ...metadata(dataSource),
  };
}
