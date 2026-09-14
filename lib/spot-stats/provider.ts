import {
  readSpotStatsConfig,
  SPORTSDATAIO_MAX_RESPONSE_BYTES,
  SPORTSDATAIO_MAX_ROWS,
  SPORTSDATAIO_TIMEOUT_MS,
  sportsDataIOSeasonEndpoint,
} from "./config.ts";
import type { SpotStatsConfig } from "./config.ts";
import type { SpotSeason, SportsDataIOSeasonEnvelope } from "./types.ts";

export type SpotStatsProviderErrorCode =
  | "disabled"
  | "unauthorized"
  | "rate-limited"
  | "http-error"
  | "timeout"
  | "network-error"
  | "response-too-large"
  | "invalid-response";

const messages: Record<SpotStatsProviderErrorCode, string> = {
  disabled: "Spot Stats provider imports are disabled.",
  unauthorized: "SportsDataIO denied access. Verify the server credential and NFL Scores entitlement.",
  "rate-limited": "SportsDataIO rate limited this import. No retry was made.",
  "http-error": "SportsDataIO could not complete this import. No retry was made.",
  timeout: "SportsDataIO import timed out. No retry was made.",
  "network-error": "SportsDataIO import could not connect. No retry was made.",
  "response-too-large": "SportsDataIO response exceeded the import size limit.",
  "invalid-response": "SportsDataIO returned an invalid season response.",
};

/** Messages never retain request headers, provider bodies, or underlying errors. */
export class SpotStatsProviderError extends Error {
  readonly code: SpotStatsProviderErrorCode;

  constructor(code: SpotStatsProviderErrorCode) {
    super(messages[code]);
    this.name = "SpotStatsProviderError";
    this.code = code;
  }
}

async function readBoundedBody(response: Response): Promise<unknown[]> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > SPORTSDATAIO_MAX_RESPONSE_BYTES)) {
    throw new SpotStatsProviderError("response-too-large");
  }
  if (!response.body) throw new SpotStatsProviderError("invalid-response");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SPORTSDATAIO_MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new SpotStatsProviderError("response-too-large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new SpotStatsProviderError("invalid-response");
  }
  if (!Array.isArray(parsed)) throw new SpotStatsProviderError("invalid-response");
  if (parsed.length > SPORTSDATAIO_MAX_ROWS) throw new SpotStatsProviderError("response-too-large");
  return parsed;
}

/** One manual season request. Never call from a Client Component or a request-rendered page. */
export async function fetchSportsDataIOSeason({
  season,
  seasonType,
  config = readSpotStatsConfig(),
  fetchImpl = fetch,
  now = () => new Date(),
}: SpotSeason & {
  config?: SpotStatsConfig;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<SportsDataIOSeasonEnvelope> {
  const endpoint = sportsDataIOSeasonEndpoint({ season, seasonType });
  // Revalidate supplied configuration so JavaScript callers cannot bypass the gates.
  const checked = readSpotStatsConfig({
    SURF_SPOT_STATS_MODE: config.mode,
    SPORTSDATAIO_API_KEY: config.apiKey ?? undefined,
    SURF_SPOT_STATS_RIGHTS_CONFIRMED: String(config.rightsConfirmed),
  });
  if (checked.mode === "disabled") throw new SpotStatsProviderError("disabled");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SpotStatsProviderError("timeout"));
    }, SPORTSDATAIO_TIMEOUT_MS);
  });
  try {
    const records = await Promise.race([
      (async () => {
        const response = await fetchImpl(endpoint, {
          method: "GET",
          headers: { "Ocp-Apim-Subscription-Key": checked.apiKey!, Accept: "application/json" },
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          if (response.status === 401 || response.status === 403) throw new SpotStatsProviderError("unauthorized");
          if (response.status === 429) throw new SpotStatsProviderError("rate-limited");
          throw new SpotStatsProviderError("http-error");
        }
        return readBoundedBody(response);
      })(),
      timeout,
    ]);
    const retrievedAt = now().toISOString();
    return {
      season,
      seasonType,
      source: {
        provider: "sportsdataio",
        endpoint,
        retrievedAt,
        access: checked.mode,
        lineBasis: "game-start",
        closingVerified: false,
      },
      records,
    };
  } catch (error) {
    if (error instanceof SpotStatsProviderError) throw error;
    throw new SpotStatsProviderError(controller.signal.aborted ? "timeout" : "network-error");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
