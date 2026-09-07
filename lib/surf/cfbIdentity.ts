/** Provider identities are bootstrapped from the NCAA catalog, never the NFL map. */
export type CfbTeam = { id: number; name: string; logo?: string | null };
const ALIASES: Readonly<Record<string, string>> = {
  'uconn': 'connecticut', 'umass': 'massachusetts', 'ole miss': 'mississippi',
  'miami fl': 'miami hurricanes', 'miami florida': 'miami hurricanes',
  'miami oh': 'miami redhawks', 'miami ohio': 'miami redhawks',
  'nc state': 'north carolina state', 'app state': 'appalachian state',
  'pitt': 'pittsburgh', 'southern cal': 'usc',
};
export function normalizeCfbName(name: string): string {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/^\s*(?:no\.?\s*|#)?\d{1,2}\s+/, '')
    .replace(/['’]/g, "").replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\bst\b/g, 'state');
  for (const [alias, canonical] of Object.entries(ALIASES).sort((a,b)=>b[0].length-a[0].length)) {
    if (normalized === alias || normalized.startsWith(alias + ' ')) return canonical + normalized.slice(alias.length);
  }
  return normalized;
}
const resolutions = new WeakMap<readonly CfbTeam[], Map<string, CfbTeam | undefined>>();
export function resolveCfbTeam(name: string, catalog: readonly CfbTeam[]): CfbTeam | undefined {
  let cache = resolutions.get(catalog);
  if (!cache) { cache = new Map(); resolutions.set(catalog, cache); }
  if (cache.has(name)) return cache.get(name);
  const result = resolveUncached(name, catalog);
  if (cache.size > 5000) cache.clear();
  cache.set(name, result);
  return result;
}
function resolveUncached(name: string, catalog: readonly CfbTeam[]): CfbTeam | undefined {
  const key = normalizeCfbName(name);
  if (!key || ['miami', 'state', 'southern', 'central'].includes(key)) return undefined;
  const exact = catalog.filter(team => normalizeCfbName(team.name) === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  // Only whole school-name prefixes; never mascot, city-only fuzzy distance, or acronym guessing.
  const candidates = catalog.filter(team => {
    const full = normalizeCfbName(team.name);
    return full.startsWith(key + ' ') || key.startsWith(full + ' ');
  });
  const longest = Math.max(0,...candidates.map(t=>normalizeCfbName(t.name).length));
  const specific = candidates.filter(t=>normalizeCfbName(t.name).length === longest);
  return specific.length === 1 ? specific[0] : undefined;
}
export function cfbNamesMatch(a: string, b: string, catalog: readonly CfbTeam[]): boolean {
  const left = resolveCfbTeam(a, catalog), right = resolveCfbTeam(b, catalog);
  return !!left && !!right && left.id === right.id;
}
export function cfbSeasonAt(now: number): number {
  const date = new Date(now);
  return date.getUTCFullYear() - (date.getUTCMonth() < 2 ? 1 : 0);
}
