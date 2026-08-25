import type { SurfSportKey } from "./sports";
import type { OddsApiGame } from "./types";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const SHARED_SNAPSHOT_TTL_MS = 90 * 1000;

type SharedSnapshot = {
  games?: OddsApiGame[];
  fetchedAt?: number;
  inFlight?: Promise<OddsApiGame[]>;
};

declare global {
  var __surfSharedOddsSnapshots: Map<SurfSportKey, SharedSnapshot> | undefined;
}

const snapshots = globalThis.__surfSharedOddsSnapshots ?? new Map<SurfSportKey, SharedSnapshot>();
globalThis.__surfSharedOddsSnapshots = snapshots;

function oddsUrl(sportKey: SurfSportKey, apiKey: string): string {
  const url = new URL(`${ODDS_API_BASE}/sports/${sportKey}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", "us");
  url.searchParams.set("markets", "spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  return url.toString();
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
    now - existing.fetchedAt < SHARED_SNAPSHOT_TTL_MS
  ) {
    return { games: existing.games, fetchedAt: existing.fetchedAt, reused: true };
  }

  if (!options.force && existing?.inFlight) {
    const games = await existing.inFlight;
    const completed = snapshots.get(options.sportKey);
    return { games, fetchedAt: completed?.fetchedAt ?? Date.now(), reused: true };
  }

  const inFlight = (async () => {
    const response = await fetch(oddsUrl(options.sportKey, options.apiKey), {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Failed to fetch odds (${response.status}): ${body}`);
    }
    const raw: unknown = await response.json().catch(() => null);
    if (!Array.isArray(raw)) throw new Error("Unexpected Odds API response shape");
    return raw as OddsApiGame[];
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
