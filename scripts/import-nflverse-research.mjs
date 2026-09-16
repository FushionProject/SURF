import { NFLVERSE_GAMES_URL } from "../lib/spot-stats/nflverse.ts";
import { fetchNflverseFile } from "../lib/spot-stats/nflverse-fetch.ts";
import { NFLVERSE_LICENSE_URL } from "../lib/spot-stats/nflverse-archive.ts";
import { saveNflverseResearch } from "../lib/spot-stats/nflverse-store.ts";
import { saveNflverseResearchToSupabase } from "../lib/spot-stats/nflverse-supabase-store.ts";

const args = process.argv.slice(2);
const wantsHelp = args.length === 0 || (args.length === 1 && args[0] === "--help");
const known = new Set(["--fetch", "--supabase"]);
const unknown = args.filter((arg) => !known.has(arg));

async function researchClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for --supabase.");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

if (wantsHelp) {
  console.log("Usage: npm run stats:import:nflverse -- --fetch [--supabase]\nDownloads the official games CSV and repository license once. No key, polling, app publication, or paid API calls. --fetch writes the ignored private local archive; --supabase additionally stores the same archive in the server-only research table, which a deployed instance can read because it has no writable disk. Publication rights stay unconfirmed either way.");
} else if (!args.includes("--fetch") || unknown.length || new Set(args).size !== args.length) {
  console.error("Use --help, or --fetch with an optional --supabase. Nothing was downloaded.");
  process.exitCode = 1;
} else {
  const durable = args.includes("--supabase");
  try {
    const [csv, license] = await Promise.all([
      fetchNflverseFile(NFLVERSE_GAMES_URL), fetchNflverseFile(NFLVERSE_LICENSE_URL),
    ]);
    const retrievedAt = new Date().toISOString();
    const imported = await saveNflverseResearch(csv, license, retrievedAt);
    let stored = null;
    if (durable) {
      const client = await researchClient();
      const record = await saveNflverseResearchToSupabase(client, csv, license, retrievedAt);
      stored = { archiveSha256: record.archiveSha256, completedGames: record.report.games.length };
    }
    const seasons = [...new Set(imported.report.games.map((game) => game.season))].sort((a, b) => a - b);
    console.log(JSON.stringify({
      status: "private-research-imported", source: NFLVERSE_GAMES_URL,
      completedGames: imported.report.games.length, seasons: [seasons[0], seasons.at(-1)],
      received: imported.report.received, rejected: imported.report.rejected,
      duplicates: imported.report.duplicates, reasons: imported.report.reasons,
      sha256: imported.sha256, archiveSha256: imported.archiveSha256, retrievedAt: imported.retrievedAt, archive: imported.path,
      durableStorage: stored, publicationRights: "unconfirmed", publicPagesChanged: false,
    }, null, 2));
  } catch {
    console.error("NFL research import failed. Check the official source/schema; any previous import remains selected. No paid API calls were made.");
    process.exitCode = 1;
  }
}
