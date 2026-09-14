import { NFLVERSE_GAMES_URL } from "../lib/spot-stats/nflverse.ts";
import { fetchNflverseFile, NFLVERSE_LICENSE_URL, saveNflverseResearch } from "../lib/spot-stats/nflverse-store.ts";

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
  console.log("Usage: npm run stats:import:nflverse -- --fetch\nDownloads the official games CSV and repository license once. No key, polling, app publication, or paid API calls. Files stay in ignored private research storage.");
} else if (args.length !== 1 || args[0] !== "--fetch") {
  console.error("Use --help or --fetch only. Nothing was downloaded.");
  process.exitCode = 1;
} else {
  try {
    const [csv, license] = await Promise.all([
      fetchNflverseFile(NFLVERSE_GAMES_URL), fetchNflverseFile(NFLVERSE_LICENSE_URL),
    ]);
    const imported = await saveNflverseResearch(csv, license, new Date().toISOString());
    const seasons = [...new Set(imported.report.games.map((game) => game.season))].sort((a, b) => a - b);
    console.log(JSON.stringify({
      status: "private-research-imported", source: NFLVERSE_GAMES_URL,
      completedGames: imported.report.games.length, seasons: [seasons[0], seasons.at(-1)],
      received: imported.report.received, rejected: imported.report.rejected,
      duplicates: imported.report.duplicates, reasons: imported.report.reasons,
      sha256: imported.sha256, archiveSha256: imported.archiveSha256, retrievedAt: imported.retrievedAt, archive: imported.path,
      publicationRights: "unconfirmed", publicPagesChanged: false,
    }, null, 2));
  } catch {
    console.error("NFL research import failed. Check the official source/schema; any previous import remains selected. No paid API calls were made.");
    process.exitCode = 1;
  }
}
