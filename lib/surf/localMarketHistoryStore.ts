import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GameMarketAverage, MarketAverageHistoryPoint } from "./marketAverage";
import { mergePersistentGameMarketAverage } from "./persistentMarketHistoryCore.ts";

export type LocalHistoryCapture = {
  sportKey: string;
  gameId: string;
  commenceTime: string;
  average: GameMarketAverage;
};

const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_GAMES = 1_000;
const MAX_POINTS = 512;
const RETAIN_AFTER_GAME_MS = 7 * 24 * 60 * 60 * 1_000;

function boundedHistory(points: MarketAverageHistoryPoint[]): MarketAverageHistoryPoint[] {
  return points.length <= MAX_POINTS ? points : [points[0], ...points.slice(-MAX_POINTS + 1)];
}

function isAverage(value: unknown): value is GameMarketAverage {
  if (!value || typeof value !== "object") return false;
  const average = value as GameMarketAverage;
  const validValue = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
  const validPoints = (v: unknown) => Array.isArray(v) && v.length <= MAX_POINTS && v.every(point =>
    point && typeof point.timestamp === "string" && Number.isFinite(Date.parse(point.timestamp))
      && validValue(point.spreadAvg) && validValue(point.totalAvg));
  return typeof average.gameKey === "string"
    && [average.openSpreadAvg, average.currentSpreadAvg, average.peakSpreadAvg,
      average.openTotalAvg, average.currentTotalAvg, average.peakTotalAvg].every(validValue)
    && validPoints(average.spreadHistory) && validPoints(average.totalHistory)
    && typeof average.lastObservedAt === "string" && Number.isFinite(Date.parse(average.lastObservedAt));
}

function validEntry(value: unknown): value is LocalHistoryCapture {
  if (!value || typeof value !== "object") return false;
  const entry = value as LocalHistoryCapture;
  return typeof entry.sportKey === "string" && typeof entry.gameId === "string"
    && typeof entry.commenceTime === "string" && Number.isFinite(Date.parse(entry.commenceTime))
    && isAverage(entry.average);
}

// Local development only, one application process. Atomic replacement prevents
// truncated files; this is deliberately not a substitute for a shared database.
export class LocalMarketHistoryStore {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly filePath: string;

  constructor(filePath: string) { this.filePath = filePath; }

  record(captures: LocalHistoryCapture[], now: number): Promise<Record<string, GameMarketAverage>> {
    const operation = this.queue.then(() => this.recordSerial(captures, now));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async recordSerial(captures: LocalHistoryCapture[], now: number): Promise<Record<string, GameMarketAverage>> {
    let saved: LocalHistoryCapture[] = [];
    try {
      if ((await stat(this.filePath)).size > MAX_FILE_BYTES) throw new Error("Local history exceeds its safe size limit.");
      const document = JSON.parse(await readFile(this.filePath, "utf8"));
      if (document?.version !== 1 || !Array.isArray(document.games)
        || document.games.length > MAX_GAMES || !document.games.every(validEntry)) {
        throw new Error("Unrecognized local history; preserving the existing file.");
      }
      saved = document.games;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    }
    const entries = new Map(saved
      .filter(entry => Date.parse(entry.commenceTime) + RETAIN_AFTER_GAME_MS >= now)
      .map(entry => [`${entry.sportKey}:${entry.gameId}`, entry]));
    const result: Record<string, GameMarketAverage> = {};
    let changed = entries.size !== saved.length;
    for (const capture of captures) {
      if (!validEntry(capture)) continue;
      const key = `${capture.sportKey}:${capture.gameId}`;
      const previous = entries.get(key);
      const incomingAt = Date.parse(capture.average.lastObservedAt!);
      const previousAt = previous ? Date.parse(previous.average.lastObservedAt!) : 0;
      // Browser cache reuses and late responses cannot create an extra timepoint.
      if (previous && incomingAt <= previousAt) {
        result[capture.gameId] = previous.average;
        continue;
      }
      const average = mergePersistentGameMarketAverage(capture.average, previous?.average);
      average.historySource = "local";
      average.spreadHistory = boundedHistory(average.spreadHistory);
      average.totalHistory = boundedHistory(average.totalHistory);
      entries.set(key, { ...capture, average });
      result[capture.gameId] = average;
      changed = true;
    }
    if (changed) {
      const games = [...entries.values()]
        .sort((a, b) => Date.parse(b.average.lastObservedAt!) - Date.parse(a.average.lastObservedAt!))
        .slice(0, MAX_GAMES);
      const body = JSON.stringify({ version: 1, games });
      if (Buffer.byteLength(body) > MAX_FILE_BYTES) throw new Error("Local history exceeds its safe size limit.");
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporary, body, { mode: 0o600 });
      await rename(temporary, this.filePath);
    }
    return result;
  }
}
