// Node-only importer. Never import this client from a page or browser component.
export const API_SPORTS_ORIGIN = "https://v1.american-football.api-sports.io";
export const API_SPORTS_MAX_BYTES = 4 * 1024 * 1024;

export function readApiSportsKey(env: Record<string, string | undefined> = process.env): string {
  if (typeof window !== "undefined") throw new Error("Server-only provider access.");
  if (env.NEXT_PUBLIC_API_SPORTS_KEY) throw new Error("Remove the public provider key; use API_SPORTS_KEY on the server.");
  const key = env.API_SPORTS_KEY?.trim();
  if (!key || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) throw new Error("A valid server-only API_SPORTS_KEY is required.");
  return key;
}

/** One fixed-host request, bounded response, no redirects/retries or background calls. */
export async function fetchApiSportsSeason(season: number, apiKey: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (typeof window !== "undefined") throw new Error("Server-only provider access.");
  if (!Number.isInteger(season) || season < 2010 || season > new Date().getUTCFullYear()) throw new Error("Choose an available NFL season from 2010 through the current year.");
  const key = readApiSportsKey({ API_SPORTS_KEY: apiKey });
  let response: Response;
  try {
    response = await fetcher(`${API_SPORTS_ORIGIN}/games?league=1&season=${season}`, {
      headers: { "x-apisports-key": key, Accept: "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new Error("API-Sports request failed; no automatic retry was made."); }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`API-Sports returned HTTP ${response.status}; previous data is unchanged.`);
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > API_SPORTS_MAX_BYTES)) {
    await response.body.cancel();
    throw new Error("Provider response exceeds the import limit.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > API_SPORTS_MAX_BYTES) throw new Error("Oversized response.");
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch { throw new Error("API-Sports response could not be read safely; previous data is unchanged."); }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
