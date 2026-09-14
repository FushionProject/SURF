import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { API_SPORTS_MAX_BYTES, fetchApiSportsSeason, readApiSportsKey } from '../lib/spot-stats/api-sports-client.ts';
import { loadApiSportsResearch, loadApiSportsResearchSeason, saveApiSportsResearch } from '../lib/spot-stats/api-sports-store.ts';

const fixture = {
  get:'games', parameters:{league:'1',season:'2025'}, errors:[], results:1,
  response:[{ game:{id:12345,stage:'Regular Season',week:'Week 1',date:{timezone:'UTC',date:'2025-09-07',time:'17:00',timestamp:1757264400},status:{short:'FT'}},
    league:{id:1,season:'2025'}, teams:{home:{id:1,name:'Pittsburgh Steelers'},away:{id:2,name:'Baltimore Ravens'}}, scores:{home:{total:21},away:{total:17}}}],
};
const retrievedAt = '2026-09-08T23:00:00.000Z';
assert.throws(() => readApiSportsKey({}), /required/);
assert.throws(() => readApiSportsKey({API_SPORTS_KEY:'test',NEXT_PUBLIC_API_SPORTS_KEY:'bad'}), /public/);
assert.throws(() => readApiSportsKey({API_SPORTS_KEY:'secret\nvalue'}), /required/);
let calls = 0;
const fetcher = async (url, options) => {
  calls++;
  assert.equal(url,'https://v1.american-football.api-sports.io/games?league=1&season=2025');
  assert.equal(options.headers['x-apisports-key'],'test-secret');
  assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');
  assert.ok(options.signal);
  return new Response(JSON.stringify(fixture));
};
assert.equal(await fetchApiSportsSeason(2025,'test-secret',fetcher),JSON.stringify(fixture));
assert.equal(calls,1);
await assert.rejects(fetchApiSportsSeason(2009,'test-secret',fetcher),/2010/);
assert.equal(calls,1);
await assert.rejects(fetchApiSportsSeason(2025,'test-secret',async()=>{throw Error('test-secret');}),error=>!error.message.includes('test-secret'));
await assert.rejects(fetchApiSportsSeason(2025,'test-secret',async()=>new Response('secret', {status:429})),/429/);
await assert.rejects(fetchApiSportsSeason(2025,'test-secret',async()=>new Response('x',{headers:{'content-length':String(API_SPORTS_MAX_BYTES+1)}})),/limit/);
await assert.rejects(fetchApiSportsSeason(2025,'test-secret',async()=>new Response('x'.repeat(API_SPORTS_MAX_BYTES+1))),/safely/);

const root = await mkdtemp(path.join(os.tmpdir(),'surf-api-sports-test-'));
try {
  const absent = await loadApiSportsResearch(path.join(root,'absent'));
  assert.equal(absent.games.length,0);
  const imported = await saveApiSportsResearch(JSON.stringify(fixture),2025,retrievedAt,root);
  assert.equal(imported.report.games.length,1);
  assert.equal((await stat(imported.path)).mode & 0o777,0o600);
  const rawArchive = await readFile(imported.path,'utf8');
  assert.equal(rawArchive.includes('test-secret'),false);
  const loaded = await loadApiSportsResearch(root);
  assert.equal(loaded.games.length,1);
  assert.equal(loaded.games[0].homeSpread,null);
  assert.equal(loaded.games[0].source.access,'research');
  assert.equal(loaded.imports[0].archiveSha256,imported.archiveSha256);
  const pointer = await readFile(path.join(root,'2025.current.json'),'utf8');
  await assert.rejects(saveApiSportsResearch(JSON.stringify({...fixture,errors:{token:'bad'}}),2025,retrievedAt,root));
  await assert.rejects(saveApiSportsResearch(JSON.stringify({...fixture,response:[],results:0}),2025,retrievedAt,root));
  assert.equal(await readFile(path.join(root,'2025.current.json'),'utf8'),pointer);
  const missing = structuredClone(fixture);
  missing.response[0].game.stage = null;
  missing.response[0].game.week = null;
  const unavailable = await saveApiSportsResearch(JSON.stringify(missing),2025,'2026-09-08T23:01:00.000Z',root);
  assert.equal(unavailable.report.received,1);
  assert.equal(unavailable.report.games.length,0);
  assert.equal(unavailable.selected,false);
  assert.equal(await readFile(path.join(root,'2025.current.json'),'utf8'),pointer);
  assert.equal((await loadApiSportsResearchSeason(2025,root)).report.games.length,1);
  assert.equal((await readdir(root)).filter(name=>name.startsWith('season-')).length,2);
  await writeFile(imported.path,(await readFile(imported.path,'utf8')).replace('Pittsburgh Steelers','Seattle Seahawks'));
  await assert.rejects(loadApiSportsResearchSeason(2025,root),/fingerprint/);
  assert.equal((await loadApiSportsResearch(root)).invalidFiles,1);
  await writeFile(path.join(root,'2025.current.json'),JSON.stringify({fileName:'../outside.json'}));
  await assert.rejects(loadApiSportsResearchSeason(2025,root),/pointer/);
} finally { await rm(root,{recursive:true,force:true}); }

// Dry-run/help work with no key and cannot fetch or write research snapshots.
for (const args of [['--help'],['--from','2010','--to','2025']]) {
  const result=spawnSync(process.execPath,['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON','--experimental-strip-types','scripts/import-api-sports-research.mjs',...args],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,API_SPORTS_KEY:''}});
  assert.equal(result.status,0,result.stderr);
  if(args[0]!=='--help') assert.equal(JSON.parse(result.stdout).networkRequests,0);
}
console.log('API-Sports client, archive integrity, cache and safe CLI checks passed.');
