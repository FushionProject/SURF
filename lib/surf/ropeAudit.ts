import type { OddsRequestTelemetry } from "./sharedOddsSnapshot";
import type { SurfSportKey } from "./sports";
import type { OddsApiGame, SignalCard } from "./types";

export const ROPE_NAME = "Release of Perfection Examination";
export const ROPE_VERSION = 1;

export type RopeStatus = "PASS" | "HOLD";
export type RopeCheckStatus = "pass" | "warn" | "fail";
export type RopeCheckCategory = "runtime" | "market-data" | "signals" | "providers" | "polling" | "api-budget";
export type RopeProviderStatus = "available" | "partial" | "unavailable" | "no_coverage" | "disabled";

export type RopeCheck = {
  id: string;
  category: RopeCheckCategory;
  status: RopeCheckStatus;
  label: string;
  summary: string;
  details: string[];
};

export type RopeRuntimeConfiguration = {
  demoMode: boolean;
  oddsApiConfigured: boolean;
  persistentHistoryConfigured: boolean;
  persistentHistoryVerified: boolean;
  persistentHistoryError?: string;
  auditPersistenceConfigured: boolean;
  auditPersistenceVerified: boolean;
  auditPersistenceError?: string;
  privateReportConfigured: boolean;
};

export type RopeSignalEvidence = {
  id: string;
  gameId: string;
  signalType: SignalCard["signalType"];
  market?: SignalCard["market"];
  title: string;
  detail: string;
  commenceTime: string;
  observedAt?: number;
  strengthScore?: number;
  sources: NonNullable<SignalCard["sources"]>;
  valueOptions: NonNullable<SignalCard["valueOptions"]>;
  opportunity?: SignalCard["opportunity"];
  whaleActivity?: SignalCard["whaleActivity"];
};

export type RopeAuditInput = {
  sportKey: SurfSportKey;
  auditedAt: number;
  games: OddsApiGame[];
  signals: SignalCard[];
  predictionProviders: {
    kalshi: RopeProviderStatus;
    polymarket: RopeProviderStatus;
  };
  oddsTelemetry?: OddsRequestTelemetry;
  runtime: RopeRuntimeConfiguration;
};

export type RopeReport = {
  name: typeof ROPE_NAME;
  acronym: "ROPE";
  version: typeof ROPE_VERSION;
  sportKey: SurfSportKey;
  auditedAt: number;
  status: RopeStatus;
  score: number;
  releaseBlockers: string[];
  warnings: string[];
  summary: {
    games: number;
    signals: number;
    arbitrages: number;
    uniqueBooks: string[];
    minimumBooksPerGame: number;
    maximumBooksPerGame: number;
  };
  checks: RopeCheck[];
  signalEvidence: RopeSignalEvidence[];
  oddsTelemetry?: OddsRequestTelemetry;
};

declare global {
  var __surfRopeAuditHistory: Map<SurfSportKey, RopeReport[]> | undefined;
}

const auditHistory = globalThis.__surfRopeAuditHistory ?? new Map<SurfSportKey, RopeReport[]>();
globalThis.__surfRopeAuditHistory = auditHistory;

const MIN_BOOKS_PER_GAME = 4;
const NEAR_GAME_WINDOW_MS = 48 * 60 * 60 * 1000;
const FRESH_QUOTE_WINDOW_MS = 30 * 60 * 1000;
const MAX_SIGNAL_OBSERVATION_AGE_MS = 10 * 60 * 1000;
const OUTLIER_BOOKS = new Set(["Bovada", "LowVig.ag", "BetOnline.ag", "BetUS", "MyBookie.ag"]);

function check(
  id: string,
  category: RopeCheckCategory,
  status: RopeCheckStatus,
  label: string,
  summary: string,
  details: string[] = [],
): RopeCheck {
  return { id, category, status, label, summary, details };
}

function timestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bookmakerUpdatedAt(game: OddsApiGame, bookKey: string): number | undefined {
  const bookmaker = (game.bookmakers ?? []).find((book) => book.key === bookKey);
  if (!bookmaker) return undefined;
  return [
    timestamp(bookmaker.last_update),
    ...(bookmaker.markets ?? []).map((market) => timestamp(market.last_update)),
  ].reduce<number | undefined>((latest, candidate) => {
    if (candidate == null) return latest;
    return latest == null ? candidate : Math.max(latest, candidate);
  }, undefined);
}

function impliedProbability(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return -americanOdds / (-americanOdds + 100);
}

function quoteExists(
  game: OddsApiGame,
  marketKey: SignalCard["market"],
  quote: { selection: string; bookTitle: string; point?: number; price?: number },
): boolean {
  if (!marketKey) return false;
  const bookmaker = (game.bookmakers ?? []).find((book) => book.title === quote.bookTitle);
  const market = bookmaker?.markets?.find((entry) => entry.key === marketKey);
  return (market?.outcomes ?? []).some((outcome) =>
    outcome.name === quote.selection
    && (quote.point == null || (outcome.point != null && Math.abs(outcome.point - quote.point) < 0.001))
    && (quote.price == null || outcome.price === quote.price),
  );
}

function opportunityEvidenceProblems(signal: SignalCard, game: OddsApiGame | undefined, auditedAt: number): string[] {
  const opportunity = signal.opportunity;
  if (!opportunity || !game) return [];
  const problems: string[] = [];
  const bookTitles = new Set((game.bookmakers ?? []).map((book) => book.title));
  for (const source of signal.sources ?? []) {
    if (!bookTitles.has(source.book) && !/^\d+ books$/.test(source.book)) {
      problems.push(`${signal.id}: source book ${source.book} is absent from the current game snapshot`);
    }
  }

  if (opportunity.kind === "arbitrage") {
    for (const leg of opportunity.arbitrage?.legs ?? []) {
      if (!quoteExists(game, signal.market, leg)) {
        problems.push(`${signal.id}: ${leg.bookTitle} ${leg.selection} quote is not present in the current snapshot`);
      }
    }
    return problems;
  }

  if (opportunity.isMiddle) {
    const legs = opportunity.middleLegs ?? [];
    if (legs.length !== 2) {
      problems.push(`${signal.id}: middle does not contain two verifiable quoted legs`);
    }
    for (const leg of legs) {
      if (!quoteExists(game, signal.market, leg)) {
        problems.push(`${signal.id}: ${leg.bookTitle} ${leg.selection} middle quote is not present in the current snapshot`);
      }
    }
    if (legs.length !== 2) return problems;
    if (legs[0].bookTitle === legs[1].bookTitle) {
      problems.push(`${signal.id}: middle legs must use distinct sportsbooks`);
    }
    if (legs.some(leg => !Number.isFinite(leg.point) || !Number.isInteger(leg.point * 2) ||
        !Number.isFinite(leg.price) || Math.abs(leg.price) < 100)) {
      problems.push(`${signal.id}: middle contains an invalid line or price`);
      return problems;
    }
    const firstSelection = signal.market === "spreads" ? game.away_team : "Over";
    const secondSelection = signal.market === "spreads" ? game.home_team : "Under";
    const first = legs.find(leg => leg.selection === firstSelection);
    const second = legs.find(leg => leg.selection === secondSelection);
    if ((signal.market !== "spreads" && signal.market !== "totals") || !first || !second) {
      problems.push(`${signal.id}: middle legs do not cover opposite selections in the same market`);
      return problems;
    }
    const lower = signal.market === "spreads" ? -first.point : first.point;
    const upper = second.point;
    const width = upper - lower;
    let winningOutcomes = Math.max(0, Math.ceil(upper) - Math.floor(lower) - 1);
    if (signal.market === "spreads" && (game.sport_key === "baseball_mlb" || game.sport_key === "americanfootball_ncaaf") && lower < 0 && upper > 0) {
      winningOutcomes -= 1;
    }
    if (!Number.isFinite(width) || width <= 0 || winningOutcomes < 1) {
      problems.push(`${signal.id}: middle has no attainable double-win result; pushes do not count`);
    }
    if (!Number.isFinite(opportunity.middleWidth) || Math.abs(opportunity.middleWidth! - width) > 0.000001 ||
        opportunity.middleWinningOutcomes !== winningOutcomes) {
      problems.push(`${signal.id}: middle width or winning-result count disagrees with its quoted legs`);
    }
    const combined = impliedProbability(first.price) + impliedProbability(second.price);
    const outsideCost = Math.max(0, 1 - 1 / combined) * 100;
    if (!Number.isFinite(opportunity.middleOutsideCostPercentage) ||
        Math.abs(opportunity.middleOutsideCostPercentage! - outsideCost) > 0.000001) {
      problems.push(`${signal.id}: middle outside-cost estimate disagrees with its quoted prices`);
    }
    const providerTimes = legs.map(leg => {
      const book = (game.bookmakers ?? []).find(entry => entry.title === leg.bookTitle);
      const market = (book?.markets ?? []).find(entry => entry.key === signal.market);
      return timestamp(market?.last_update) ?? timestamp(book?.last_update);
    });
    if (providerTimes.some(time => time == null || time > auditedAt + 60_000 || auditedAt - time > 10 * 60_000) ||
        Math.abs(providerTimes[0]! - providerTimes[1]!) > 5 * 60_000) {
      problems.push(`${signal.id}: middle quoted legs are not comparably fresh`);
    }
    return problems;
  }

  if (opportunity.favoriteSplit) {
    for (const side of [opportunity.favoriteSplit.away, opportunity.favoriteSplit.home]) {
      if (!quoteExists(game, "h2h", { selection: side.team, bookTitle: side.bookTitle, price: side.price })) {
        problems.push(`${signal.id}: ${side.bookTitle} ${side.team} favorite quote is not present in the current snapshot`);
      }
      const opponent = side.team === game.away_team ? game.home_team : game.away_team;
      if (!quoteExists(game, "h2h", { selection: opponent, bookTitle: side.bookTitle, price: side.opponentPrice })) {
        problems.push(`${signal.id}: ${side.bookTitle} opposing moneyline is not present in the current snapshot`);
      }
    }
    return problems;
  }

  if (!quoteExists(game, signal.market, opportunity)) {
    problems.push(`${signal.id}: highlighted ${opportunity.bookTitle} quote is not present in the current snapshot`);
  }
  return problems;
}

function runtimeChecks(runtime: RopeRuntimeConfiguration): RopeCheck[] {
  return [
    runtime.demoMode
      ? check("runtime.live-mode", "runtime", "fail", "Live data mode", "Demo mode is enabled in the release candidate.")
      : check("runtime.live-mode", "runtime", "pass", "Live data mode", "Demo mode is disabled."),
    runtime.oddsApiConfigured
      ? check("runtime.odds-key", "runtime", "pass", "Odds provider configuration", "The Odds API is configured.")
      : check("runtime.odds-key", "runtime", "fail", "Odds provider configuration", "ODDS_API_KEY is missing."),
    !runtime.persistentHistoryConfigured
      ? check("runtime.market-history", "runtime", "fail", "Durable market history", "Market history would reset when the server restarts.")
      : runtime.persistentHistoryError
        ? check(
            "runtime.market-history",
            "runtime",
            "fail",
            "Durable market history",
            "The configured market-history store failed verification.",
            [runtime.persistentHistoryError],
          )
        : runtime.persistentHistoryVerified
          ? check("runtime.market-history", "runtime", "pass", "Durable market history", "The Supabase history schema and server access were verified.")
          : check("runtime.market-history", "runtime", "fail", "Durable market history", "Supabase is configured but its history schema has not been verified."),
    !runtime.auditPersistenceConfigured
      ? check("runtime.audit-history", "runtime", "fail", "Durable ROPE history", "ROPE reports are currently retained in memory only.")
      : runtime.auditPersistenceError
        ? check(
            "runtime.audit-history",
            "runtime",
            "fail",
            "Durable ROPE history",
            "The configured ROPE report store failed its latest write.",
            [runtime.auditPersistenceError],
          )
        : runtime.auditPersistenceVerified
          ? check("runtime.audit-history", "runtime", "pass", "Durable ROPE history", "The ROPE audit schema and server access were verified.")
          : check("runtime.audit-history", "runtime", "fail", "Durable ROPE history", "The report store is configured but has not passed schema verification."),
    runtime.privateReportConfigured
      ? check("runtime.private-report", "runtime", "pass", "Private report access", "The private ROPE report token is configured.")
      : check("runtime.private-report", "runtime", "fail", "Private report access", "ROPE_AUDIT_TOKEN is missing or too short."),
  ];
}

function marketDataChecks(games: OddsApiGame[], auditedAt: number): RopeCheck[] {
  if (games.length === 0) {
    return [
      check("market.games", "market-data", "fail", "Upcoming game coverage", "No upcoming games were returned."),
      check("market.books", "market-data", "fail", "Sportsbook coverage", "Sportsbook coverage cannot be examined without games."),
      check("market.freshness", "market-data", "warn", "Quote freshness", "No near-term quotes are available to examine."),
    ];
  }

  const bookCounts = games.map((game) => new Set((game.bookmakers ?? []).map((book) => book.key)).size);
  const lowCoverage = games.filter((game) => new Set((game.bookmakers ?? []).map((book) => book.key)).size < MIN_BOOKS_PER_GAME);
  const titles = [...new Set(games.flatMap((game) => (game.bookmakers ?? []).map((book) => book.title)))].sort();
  const outliers = titles.filter((title) => OUTLIER_BOOKS.has(title));
  const deprecatedBrands = titles.filter((title) => /espn\s*bet/i.test(title));

  const coverageStatus: RopeCheckStatus = lowCoverage.length > 0 || outliers.length > 0 || deprecatedBrands.length > 0 ? "fail" : "pass";
  const coverageDetails = [
    ...lowCoverage.slice(0, 10).map((game) => `${game.away_team} at ${game.home_team}: ${(game.bookmakers ?? []).length} books`),
    ...outliers.map((title) => `Outlier book present: ${title}`),
    ...deprecatedBrands.map((title) => `Deprecated brand label present: ${title}`),
  ];

  const nearGames = games.filter((game) => {
    const commenceAt = timestamp(game.commence_time);
    return commenceAt != null && commenceAt > auditedAt && commenceAt - auditedAt <= NEAR_GAME_WINDOW_MS;
  });
  const quoteAges = nearGames.flatMap((game) =>
    (game.bookmakers ?? []).flatMap((bookmaker) => {
      const updatedAt = bookmakerUpdatedAt(game, bookmaker.key);
      return updatedAt == null ? [] : [Math.max(0, auditedAt - updatedAt)];
    }),
  );
  const nearQuoteCount = nearGames.reduce((sum, game) => sum + (game.bookmakers ?? []).length, 0);
  const missingQuoteTimestamps = Math.max(0, nearQuoteCount - quoteAges.length);
  const freshQuotes = quoteAges.filter((age) => age <= FRESH_QUOTE_WINDOW_MS).length;
  const freshRatio = quoteAges.length > 0 ? freshQuotes / quoteAges.length : 1;
  const maximumAge = quoteAges.length > 0 ? Math.max(...quoteAges) : 0;
  const freshnessStatus: RopeCheckStatus =
    nearGames.length === 0
      ? "pass"
      : quoteAges.length === 0 || freshRatio < 0.5
        ? "fail"
        : freshRatio < 0.8 || missingQuoteTimestamps > 0
          ? "warn"
          : "pass";

  return [
    check("market.games", "market-data", "pass", "Upcoming game coverage", `${games.length} upcoming games are available.`),
    check(
      "market.books",
      "market-data",
      coverageStatus,
      "Sportsbook coverage",
      `${titles.length} approved brands; ${Math.min(...bookCounts)}-${Math.max(...bookCounts)} books per game.`,
      coverageDetails,
    ),
    check(
      "market.freshness",
      "market-data",
      freshnessStatus,
      "Quote freshness",
      nearGames.length === 0
        ? "No games begin within 48 hours; freshness is not release-blocking for this slate."
        : `${Math.round(freshRatio * 100)}% of timestamped quotes for ${nearGames.length} near-term games were updated within 30 minutes.`,
      [
        `Timestamped quotes: ${quoteAges.length}/${nearQuoteCount}`,
        `Oldest quote age: ${Math.round(maximumAge / 60_000)} minutes`,
      ],
    ),
  ];
}

function arbitrageProblems(signal: SignalCard): string[] {
  if (signal.opportunity?.kind !== "arbitrage") return [];
  const arbitrage = signal.opportunity.arbitrage;
  if (!arbitrage || arbitrage.legs.length !== 2) return [`${signal.id}: arbitrage does not contain exactly two legs`];
  const [first, second] = arbitrage.legs;
  const problems: string[] = [];
  if (!first || !second) return [`${signal.id}: arbitrage legs are incomplete`];
  if (first.bookTitle === second.bookTitle) problems.push(`${signal.id}: both arb legs use ${first.bookTitle}`);
  if (!Number.isFinite(first.price) || !Number.isFinite(second.price) || first.price === 0 || second.price === 0) {
    problems.push(`${signal.id}: invalid American price`);
    return problems;
  }
  const combined = impliedProbability(first.price) + impliedProbability(second.price);
  const estimatedReturn = (1 / combined - 1) * 100;
  if (combined >= 1) problems.push(`${signal.id}: implied probability is ${(combined * 100).toFixed(2)}%`);
  if (estimatedReturn < 0.5 || estimatedReturn > 15) problems.push(`${signal.id}: theoretical return ${estimatedReturn.toFixed(2)}% is outside policy`);
  if (Math.abs(combined - arbitrage.combinedImpliedProbability) > 0.0001) {
    problems.push(`${signal.id}: recorded implied probability does not match the prices`);
  }
  if (Math.abs(estimatedReturn - arbitrage.estimatedReturnPercentage) > 0.05) {
    problems.push(`${signal.id}: recorded return does not match the prices`);
  }
  return problems;
}

function signalChecks(signals: SignalCard[], games: OddsApiGame[], auditedAt: number): RopeCheck[] {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const seenIds = new Set<string>();
  const seenSemanticKeys = new Set<string>();
  const integrityProblems: string[] = [];
  const duplicateProblems: string[] = [];
  const staleProblems: string[] = [];
  const fabricatedCopyProblems: string[] = [];
  const arbProblems: string[] = [];

  for (const signal of signals) {
    if (seenIds.has(signal.id)) duplicateProblems.push(`Duplicate signal id: ${signal.id}`);
    seenIds.add(signal.id);
    const semanticKey = `${signal.game.id}:${signal.market ?? "none"}:${signal.signalType}:${signal.title}`;
    if (seenSemanticKeys.has(semanticKey)) duplicateProblems.push(`Duplicate signal meaning: ${semanticKey}`);
    seenSemanticKeys.add(semanticKey);

    const game = gamesById.get(signal.game.id);
    if (!game) integrityProblems.push(`${signal.id}: game is absent from the audited slate`);
    if (!signal.title.trim() || !signal.detail.trim() || !signal.insight.trim()) integrityProblems.push(`${signal.id}: customer copy is incomplete`);
    if (/\b(?:demo|sample|mock|placeholder|simulated)\b/i.test(`${signal.title} ${signal.detail}`)) {
      fabricatedCopyProblems.push(`${signal.id}: contains non-live placeholder language`);
    }
    if (signal.opportunity) {
      if (signal.opportunity.booksCompared < MIN_BOOKS_PER_GAME) integrityProblems.push(`${signal.id}: only ${signal.opportunity.booksCompared} books support the opportunity`);
      if ((signal.sources ?? []).length < 2) integrityProblems.push(`${signal.id}: opportunity evidence has fewer than two visible sources`);
      if (signal.opportunity.isMiddle && (!(signal.opportunity.middleWidth && signal.opportunity.middleWidth > 0) || signal.opportunity.kind === "arbitrage")) {
        integrityProblems.push(`${signal.id}: middle evidence is inconsistent`);
      }
    }
    if (signal.whaleActivity) {
      if (signal.whaleActivity.committedUsd < 10_000) integrityProblems.push(`${signal.id}: whale activity is below the $10,000 policy`);
      if (!/^https:\/\//.test(signal.whaleActivity.sourceUrl)) integrityProblems.push(`${signal.id}: whale activity lacks a secure source link`);
    }
    integrityProblems.push(...opportunityEvidenceProblems(signal, game, auditedAt));

    const observedAt = signal.lastSeenAt ?? signal.detectedAt;
    if (observedAt == null || auditedAt - observedAt > MAX_SIGNAL_OBSERVATION_AGE_MS) {
      staleProblems.push(`${signal.id}: last observed ${observedAt == null ? "never" : `${Math.round((auditedAt - observedAt) / 60_000)} minutes ago`}`);
    }
    const commenceAt = timestamp(signal.commenceTime);
    if (commenceAt == null || commenceAt <= auditedAt) staleProblems.push(`${signal.id}: game has already started or has an invalid start time`);
    arbProblems.push(...arbitrageProblems(signal));
  }

  return [
    check(
      "signals.integrity",
      "signals",
      integrityProblems.length > 0 || fabricatedCopyProblems.length > 0 ? "fail" : "pass",
      "Signal evidence integrity",
      signals.length === 0 ? "No signals currently qualify; the feed is correctly allowed to be quiet." : `${signals.length} signals contain complete, live evidence.`,
      [...integrityProblems, ...fabricatedCopyProblems].slice(0, 30),
    ),
    check(
      "signals.duplicates",
      "signals",
      duplicateProblems.length > 0 ? "fail" : "pass",
      "Duplicate rejection",
      duplicateProblems.length > 0 ? `${duplicateProblems.length} duplicate conditions were detected.` : "No duplicate signal ids or meanings were detected.",
      duplicateProblems.slice(0, 30),
    ),
    check(
      "signals.freshness",
      "signals",
      staleProblems.length > 0 ? "fail" : "pass",
      "Signal freshness",
      staleProblems.length > 0 ? `${staleProblems.length} stale or post-start signal conditions were detected.` : "Every signal belongs to a future game and was observed recently.",
      staleProblems.slice(0, 30),
    ),
    check(
      "signals.arbitrage",
      "signals",
      arbProblems.length > 0 ? "fail" : "pass",
      "Arbitrage mathematics",
      arbProblems.length > 0
        ? `${arbProblems.length} arbitrage validation problems were detected.`
        : `${signals.filter((signal) => signal.opportunity?.kind === "arbitrage").length} legitimate arbitrage signals passed exact price verification.`,
      arbProblems.slice(0, 30),
    ),
  ];
}

function providerChecks(providers: RopeAuditInput["predictionProviders"]): RopeCheck[] {
  const details = (["kalshi", "polymarket"] as const).map((provider) => `${provider}: ${providers[provider]}`);
  const unavailable = (["kalshi", "polymarket"] as const).filter((provider) => providers[provider] === "unavailable");
  const partial = (["kalshi", "polymarket"] as const).filter((provider) => providers[provider] === "partial");
  const disabled = (["kalshi", "polymarket"] as const).filter((provider) => providers[provider] === "disabled");
  const status: RopeCheckStatus = unavailable.length === 2 || disabled.length === 2 ? "fail" : unavailable.length > 0 || partial.length > 0 || disabled.length > 0 ? "warn" : "pass";
  return [
    check(
      "providers.prediction-markets",
      "providers",
      status,
      "Prediction-market providers",
      status === "pass" ? "Kalshi and Polymarket integrations responded honestly." : "At least one prediction-market provider needs attention.",
      details,
    ),
  ];
}

function pollingAndBudgetChecks(sportKey: SurfSportKey, telemetry: OddsRequestTelemetry | undefined): RopeCheck[] {
  if (!telemetry) {
    return [
      check("polling.single-flight", "polling", "warn", "Single-flight polling", "No in-process telemetry was available for this examination."),
      check("api.quota", "api-budget", "warn", "Odds API budget", "Quota headers were not available for this examination."),
    ];
  }

  const intervals = telemetry.recentRequestStartedAt
    .slice(1)
    .map((startedAt, index) => startedAt - telemetry.recentRequestStartedAt[index]!)
    .filter((interval) => interval >= 0);
  const tooFastIntervals = intervals.filter((interval) => interval < 90_000);
  const pollingProblems = [
    ...(telemetry.maxConcurrentRequests > 1 ? [`Maximum concurrent requests: ${telemetry.maxConcurrentRequests}`] : []),
    ...(tooFastIntervals.length > 0 ? [`${tooFastIntervals.length} external refresh intervals were shorter than 90 seconds`] : []),
    ...(telemetry.unattributedCreditsObserved > 0 ? [`${telemetry.unattributedCreditsObserved} Odds API credits were consumed outside this process's accounted requests`] : []),
  ];
  const pollingStatus: RopeCheckStatus = pollingProblems.length > 0 ? "fail" : telemetry.failureCount > 0 ? "warn" : "pass";

  const expectedCost = (sportKey === "baseball_mlb" || sportKey === "americanfootball_ncaaf") ? 3 : 2;
  const quotaProblems = [
    ...(telemetry.quota?.lastCost != null && telemetry.quota.lastCost > expectedCost
      ? [`Last request cost ${telemetry.quota.lastCost}; policy allows ${expectedCost}`]
      : []),
    ...(telemetry.quota?.remaining != null && telemetry.quota.remaining < 500
      ? [`Only ${telemetry.quota.remaining} credits remain`]
      : []),
  ];
  const quotaStatus: RopeCheckStatus = quotaProblems.length > 0
    ? "fail"
    : telemetry.quota?.remaining != null && telemetry.quota.remaining < 2_000
      ? "warn"
      : telemetry.quota
        ? "pass"
        : "warn";

  return [
    check(
      "polling.single-flight",
      "polling",
      pollingStatus,
      "Single-flight polling",
      pollingProblems.length > 0
        ? "Possible duplicate polling or unexplained account usage was detected."
        : `${telemetry.externalRequestCount} external requests, ${telemetry.cacheReuseCount} cache reuses, ${telemetry.inFlightReuseCount} in-flight reuses, and no overlap.`,
      [...pollingProblems, ...(telemetry.failureCount > 0 ? [`Recovered request failures: ${telemetry.failureCount}`] : [])],
    ),
    check(
      "api.quota",
      "api-budget",
      quotaStatus,
      "Odds API budget",
      telemetry.quota
        ? `Last request cost ${telemetry.quota.lastCost ?? "unknown"}; ${telemetry.quota.remaining ?? "unknown"} credits remain.`
        : "The provider response did not include quota headers.",
      quotaProblems,
    ),
  ];
}

function signalEvidence(signals: SignalCard[]): RopeSignalEvidence[] {
  return signals.map((signal) => ({
    id: signal.id,
    gameId: signal.game.id,
    signalType: signal.signalType,
    market: signal.market,
    title: signal.title,
    detail: signal.detail,
    commenceTime: signal.commenceTime,
    observedAt: signal.lastSeenAt ?? signal.detectedAt,
    strengthScore: signal.strengthScore,
    sources: signal.sources ?? [],
    valueOptions: signal.valueOptions ?? [],
    opportunity: signal.opportunity,
    whaleActivity: signal.whaleActivity,
  }));
}

export function buildRopeReport(input: RopeAuditInput): RopeReport {
  const checks = [
    ...runtimeChecks(input.runtime),
    ...marketDataChecks(input.games, input.auditedAt),
    ...signalChecks(input.signals, input.games, input.auditedAt),
    ...providerChecks(input.predictionProviders),
    ...pollingAndBudgetChecks(input.sportKey, input.oddsTelemetry),
  ];
  const releaseBlockers = checks.filter((item) => item.status === "fail").map((item) => `${item.label}: ${item.summary}`);
  const warnings = checks.filter((item) => item.status === "warn").map((item) => `${item.label}: ${item.summary}`);
  const score = Math.max(0, 100 - releaseBlockers.length * 15 - warnings.length * 5);
  const bookCounts = input.games.map((game) => new Set((game.bookmakers ?? []).map((book) => book.key)).size);
  const uniqueBooks = [...new Set(input.games.flatMap((game) => (game.bookmakers ?? []).map((book) => book.title)))].sort();

  return {
    name: ROPE_NAME,
    acronym: "ROPE",
    version: ROPE_VERSION,
    sportKey: input.sportKey,
    auditedAt: input.auditedAt,
    status: releaseBlockers.length === 0 ? "PASS" : "HOLD",
    score,
    releaseBlockers,
    warnings,
    summary: {
      games: input.games.length,
      signals: input.signals.length,
      arbitrages: input.signals.filter((signal) => signal.opportunity?.kind === "arbitrage").length,
      uniqueBooks,
      minimumBooksPerGame: bookCounts.length > 0 ? Math.min(...bookCounts) : 0,
      maximumBooksPerGame: bookCounts.length > 0 ? Math.max(...bookCounts) : 0,
    },
    checks,
    signalEvidence: signalEvidence(input.signals),
    oddsTelemetry: input.oddsTelemetry,
  };
}

export function recordRopeReport(input: RopeAuditInput): RopeReport {
  const report = buildRopeReport(input);
  const cutoff = input.auditedAt - 24 * 60 * 60 * 1000;
  const history = (auditHistory.get(input.sportKey) ?? []).filter((entry) => entry.auditedAt >= cutoff);
  history.push(report);
  auditHistory.set(input.sportKey, history.slice(-720));
  return report;
}

export function getLatestRopeReport(sportKey: SurfSportKey): RopeReport | undefined {
  return auditHistory.get(sportKey)?.at(-1);
}

export function getRopeReportHistory(sportKey: SurfSportKey): RopeReport[] {
  return (auditHistory.get(sportKey) ?? []).slice();
}
