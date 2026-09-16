// Bounded downloader for the two official nflverse files. Kept apart from any
// store so neither the filesystem nor the database is reachable from here.
import { Buffer } from "node:buffer";
import { NFLVERSE_GAMES_URL } from "./nflverse.ts";
import { NFLVERSE_LICENSE_URL, NFLVERSE_MAX_BYTES, NFLVERSE_MAX_LICENSE_BYTES } from "./nflverse-archive.ts";

/** Fixed official URLs only, bounded body and deadline; no retry or polling. */
export async function fetchNflverseFile(
  url: typeof NFLVERSE_GAMES_URL | typeof NFLVERSE_LICENSE_URL,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (url !== NFLVERSE_GAMES_URL && url !== NFLVERSE_LICENSE_URL) throw new Error("Unsupported research source.");
  const maxBytes = url === NFLVERSE_GAMES_URL ? NFLVERSE_MAX_BYTES : NFLVERSE_MAX_LICENSE_BYTES;
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
    cache: "no-store",
    headers: { Accept: "text/plain, text/csv", "User-Agent": "Surf-private-NFL-research" },
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("Official GitHub file was unavailable; archive unchanged.");
  }
  // GitHub release assets redirect to signed CDN URLs. Never retain that URL.
  if (response.url) {
    const final = new URL(response.url);
    if (final.protocol !== "https:" || ![
      "github.com", "raw.githubusercontent.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com",
    ].includes(final.hostname)) {
      await response.body.cancel();
      throw new Error("Unexpected download destination.");
    }
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body.cancel();
    throw new Error("Research source exceeds the download limit.");
  }
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error("Research source exceeds the download limit.");
      chunks.push(value);
    }
    // Fatal decoding keeps malformed byte sequences out of a supposedly intact archive.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
