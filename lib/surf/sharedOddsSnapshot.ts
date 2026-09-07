import type { SurfSportKey } from "./sports";
import type { OddsApiGame } from "./types";
import { refreshIntervalMs } from "./feedSchedule.ts";
import { filterSurfGames, SURF_ODDS_API_BOOKMAKER_KEYS } from "./bookmakers.ts";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

type SharedSnapshot = {
  games?: OddsApiGame[];
  fetchedAt?: number;
  inFlight?: Promise<OddsApiGame[]>;
};

export type OddsQuotaTelemetry = {
  used?: number;
  remaining?: number;
  lastCost?: number;
};

export type OddsRequestTelemetry = {
  sportKey: SurfSportKey;
  externalRequestCount: number;
  cacheReuseCount: number;
  inFlightReuseCount: number;
  failureCount: number;
  activeRequests: number;
  maxConcurrentRequests: number;
  recentRequestStartedAt: number[];
  lastRequestStartedAt?: number;
  lastRequestCompletedAt?: number;
  lastDurationMs?: number;
  lastResponseStatus?: number;
  lastFetchedGameCount?: number;
  lastFetchedBookmakerCount?: number;
  quota?: OddsQuotaTelemetry;
  unattributedCreditsObserved: number;
  lastError?: string;
};

type OddsAccountTelemetry = {
  highestObservedUsed?: number;
  unattributedCreditsObserved: number;
};

declare global {
  var __surfSharedOddsSnapshots: Map<SurfSportKey, SharedSnapshot> | undefined;
  var __surfOddsRequestTelemetry: Map<SurfSportKey, OddsRequestTelemetry> | undefined;
  var __surfOddsAccountTelemetry: OddsAccountTelemetry | undefined;
}

const snapshots = globalThis.__surfSharedOddsSnapshots ?? new Map<SurfSportKey, SharedSnapshot>();
globalThis.__surfSharedOddsSnapshots = snapshots;
const requestTelemetry = globalThis.__surfOddsRequestTelemetry ?? new Map<SurfSportKey, OddsRequestTelemetry>();
globalThis.__surfOddsRequestTelemetry = requestTelemetry;
const accountTelemetry = globalThis.__surfOddsAccountTelemetry ?? { unattributedCreditsObserved: 0 };
globalThis.__surfOddsAccountTelemetry = accountTelemetry;

function telemetryFor(sportKey: SurfSportKey): OddsRequestTelemetry {
  const existing = requestTelemetry.get(sportKey);
  if (existing) return existing;
  const created: OddsRequestTelemetry = {
    sportKey,
    externalRequestCount: 0,
    cacheReuseCount: 0,
    inFlightReuseCount: 0,
    failureCount: 0,
    activeRequests: 0,
    maxConcurrentRequests: 0,
    recentRequestStartedAt: [],
    unattributedCreditsObserved: 0,
  };
  requestTelemetry.set(sportKey, created);
  return created;
}

function numericHeader(response: Response, name: string): number | undefined {
  const raw = response.headers.get(name);
  if (raw == null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function recordQuota(telemetry: OddsRequestTelemetry, response: Response): void {
  const quota: OddsQuotaTelemetry = {
    used: numericHeader(response, "x-requests-used"),
    remaining: numericHeader(response, "x-requests-remaining"),
    lastCost: numericHeader(response, "x-requests-last"),
  };
  telemetry.quota = quota;
  if (quota.used == null) return;

  const previousUsed = accountTelemetry.highestObservedUsed;
  if (previousUsed != null && quota.used >= previousUsed) {
    const observedDelta = quota.used - previousUsed;
    const unattributed = Math.max(0, observedDelta - (quota.lastCost ?? 0));
    telemetry.unattributedCreditsObserved += unattributed;
    accountTelemetry.unattributedCreditsObserved += unattributed;
  }
  accountTelemetry.highestObservedUsed = Math.max(previousUsed ?? quota.used, quota.used);
}

export function getOddsRequestTelemetry(sportKey: SurfSportKey): OddsRequestTelemetry {
  const telemetry = telemetryFor(sportKey);
  return {
    ...telemetry,
    recentRequestStartedAt: telemetry.recentRequestStartedAt.slice(),
    quota: telemetry.quota ? { ...telemetry.quota } : undefined,
    unattributedCreditsObserved: accountTelemetry.unattributedCreditsObserved,
  };
}

function oddsUrl(sportKey: SurfSportKey, apiKey: string): string {
  const url = new URL(`${ODDS_API_BASE}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", apiKey);
  // An explicit set keeps outlier/offshore sources out and includes selected
  // `us2` books such as theScore Bet. Up to ten books carry the same quota cost as
  // the previous single-region request.
  url.searchParams.set("bookmakers", SURF_ODDS_API_BOOKMAKER_KEYS.join(","));
  // Moneylines are especially useful in baseball, where the price is the line.
  // Keep NFL at two requested markets so MLB support does not increase NFL quota use.
  url.searchParams.set("markets", (sportKey === "baseball_mlb" || sportKey === "americanfootball_ncaaf") ? "h2h,spreads,totals" : "spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  return url.toString();
}

function nextGameAt(games: OddsApiGame[], now: number): number | undefined {
  const future = games
    .map((game) => new Date(game.commence_time).getTime())
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= now);
  return future.length > 0 ? Math.min(...future) : undefined;
}

export async function getSharedOddsSnapshot(options: {
  sportKey: SurfSportKey;
  apiKey: string;
  force?: boolean;
}): Promise<{ games: OddsApiGame[]; fetchedAt: number; reused: boolean }> {
  const now = Date.now();
  const existing = snapshots.get(options.sportKey);
  if (
    !options.force &&
    existing?.games &&
    existing.fetchedAt != null &&
    now - existing.fetchedAt < refreshIntervalMs(now, nextGameAt(existing.games, now))
  ) {
    telemetryFor(options.sportKey).cacheReuseCount += 1;
    // A hot reload can retain snapshots captured before the curated pool changed.
    return { games: filterSurfGames(existing.games), fetchedAt: existing.fetchedAt, reused: true };
  }

  // A forced refresh may bypass cached data, but it must never create a second
  // concurrent upstream request for the same sport.
  if (existing?.inFlight) {
    telemetryFor(options.sportKey).inFlightReuseCount += 1;
    const games = await existing.inFlight;
    const completed = snapshots.get(options.sportKey);
    return { games: filterSurfGames(games), fetchedAt: completed?.fetchedAt ?? Date.now(), reused: true };
  }

  const telemetry = telemetryFor(options.sportKey);
  const requestStartedAt = Date.now();
  telemetry.externalRequestCount += 1;
  telemetry.activeRequests += 1;
  telemetry.maxConcurrentRequests = Math.max(telemetry.maxConcurrentRequests, telemetry.activeRequests);
  telemetry.lastRequestStartedAt = requestStartedAt;
  telemetry.recentRequestStartedAt.push(requestStartedAt);
  telemetry.recentRequestStartedAt = telemetry.recentRequestStartedAt.slice(-50);

  const inFlight = (async () => {
    try {
      const response = await fetch(oddsUrl(options.sportKey, options.apiKey), {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      telemetry.lastResponseStatus = response.status;
      recordQuota(telemetry, response);
      if (!response.ok) {
        throw new Error(`Failed to fetch odds (${response.status})`);
      }
      const raw: unknown = await response.json().catch(() => null);
      if (!Array.isArray(raw)) throw new Error("Unexpected Odds API response shape");
      const games = filterSurfGames([...new Map((raw as OddsApiGame[]).filter(game =>
        game.sport_key === options.sportKey && typeof game.id === "string" &&
        typeof game.home_team === "string" && typeof game.away_team === "string" &&
        game.home_team !== game.away_team && Number.isFinite(Date.parse(game.commence_time))
      ).map(game => [game.id, game])).values()]);
      telemetry.lastFetchedGameCount = games.length;
      telemetry.lastFetchedBookmakerCount = new Set(
        games.flatMap((game) => (game.bookmakers ?? []).map((bookmaker) => bookmaker.key)),
      ).size;
      telemetry.lastError = undefined;
      return games;
    } catch (error) {
      telemetry.failureCount += 1;
      telemetry.lastError = error instanceof Error ? error.message.slice(0, 240) : "Unknown odds request failure";
      throw error;
    } finally {
      telemetry.activeRequests = Math.max(0, telemetry.activeRequests - 1);
      telemetry.lastRequestCompletedAt = Date.now();
      telemetry.lastDurationMs = telemetry.lastRequestCompletedAt - requestStartedAt;
    }
  })();

  snapshots.set(options.sportKey, { ...existing, inFlight });
  try {
    const games = await inFlight;
    const fetchedAt = Date.now();
    snapshots.set(options.sportKey, { games, fetchedAt });
    return { games, fetchedAt, reused: false };
  } catch (error) {
    snapshots.set(options.sportKey, existing ?? {});
    throw error;
  }
}
