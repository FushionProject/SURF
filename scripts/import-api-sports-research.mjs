import nextEnv from '@next/env';
import { apiSportsSeasonEndpoint } from '../lib/spot-stats/api-sports.ts';
import { readApiSportsKey, fetchApiSportsSeason } from '../lib/spot-stats/api-sports-client.ts';
import { loadApiSportsResearchSeason, saveApiSportsResearch } from '../lib/spot-stats/api-sports-store.ts';

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
  console.log('Usage: npm run stats:import:api-sports -- --from 2010 --to 2025 [--fetch] [--refresh]\nOne request per uncached season. Defaults to a dry run. Existing validated seasons are reused unless --refresh is explicit. Private results only; no automatic calls, public publication, or historical odds import. API_SPORTS_KEY stays server-side.');
} else {
  try {
    const options = new Map();
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!['--from','--to','--fetch','--refresh'].includes(arg) || options.has(arg)) throw new Error('Invalid arguments.');
      if (arg === '--fetch' || arg === '--refresh') options.set(arg, true);
      else {
        const value = args[++i];
        if (!value || !/^\d{4}$/.test(value)) throw new Error('Choose season years.');
        options.set(arg, Number(value));
      }
    }
    const from = options.get('--from'); const to = options.get('--to');
    apiSportsSeasonEndpoint(from); apiSportsSeasonEndpoint(to);
    if (from > to || to - from > 29) throw new Error('Invalid season range.');
    if (!options.has('--fetch')) {
      console.log(JSON.stringify({ status:'dry-run', seasons:[from,to], maximumRequests:to-from+1, networkRequests:0, instruction:'Add --fetch to import private results using existing API-Sports access.' }));
    } else {
      nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
      const key = readApiSportsKey();
      let requests = 0;
      for (let season = from; season <= to; season++) {
        let previous;
        try { previous = await loadApiSportsResearchSeason(season); } catch { /* Missing/invalid selected file can be explicitly re-imported. */ }
        if (previous && !options.has('--refresh')) {
          console.log(JSON.stringify({ season, status:'cached', completedGames:previous.report.games.length, received:previous.report.received, rejected:previous.report.rejected, reasons:previous.report.reasons }));
          continue;
        }
        requests += 1;
        const raw = await fetchApiSportsSeason(season, key);
        const imported = await saveApiSportsResearch(raw, season, new Date().toISOString());
        console.log(JSON.stringify({ season, status:!imported.selected ? 'refresh-needs-review' : imported.report.games.length ? 'private-results-imported' : 'raw-only-needs-classification', selected:imported.selected, selectionReason:imported.selectionReason, completedGames:imported.report.games.length, received:imported.report.received, rejected:imported.report.rejected, reasons:imported.report.reasons, unclassified:imported.report.unclassified, excluded:imported.report.excluded, sha256:imported.sha256 }));
      }
      console.log(JSON.stringify({ status:'complete', requests, publicationRights:'unconfirmed', publicPagesChanged:false }));
    }
  } catch {
    // Never echo provider bodies, credentials, URLs with secrets, or arbitrary fetch errors.
    console.error('API-Sports results import stopped. Check arguments, server-only key, provider access, or response schema. Previous valid season archives remain available.');
    process.exitCode = 1;
  }
}
