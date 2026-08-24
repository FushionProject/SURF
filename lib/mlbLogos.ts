export const MLB_LOGOS: Record<string, string> = {
  ARI: "ari",
  ATL: "atl",
  BAL: "bal",
  BOS: "bos",
  CHC: "chc",
  CIN: "cin",
  CLE: "cle",
  COL: "col",
  CWS: "chw",
  DET: "det",
  HOU: "hou",
  KC: "kc",
  LAA: "laa",
  LAD: "lad",
  MIA: "mia",
  MIL: "mil",
  MIN: "min",
  NYM: "nym",
  NYY: "nyy",
  OAK: "oak",
  PHI: "phi",
  PIT: "pit",
  SD: "sd",
  SF: "sf",
  SEA: "sea",
  STL: "stl",
  TB: "tb",
  TEX: "tex",
  TOR: "tor",
  WSH: "wsh",
};

const MLB_DEFAULT_LOGO = "/logos/mlb/default.png";

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MLB_ABBREV_ALIASES: Record<string, keyof typeof MLB_LOGOS> = {
  CHW: "CWS",
  CWS: "CWS",
  KCR: "KC",
  KC: "KC",
  SDP: "SD",
  SD: "SD",
  SFG: "SF",
  SF: "SF",
  TBR: "TB",
  TB: "TB",
  WSN: "WSH",
  WAS: "WSH",
  WSH: "WSH",
  ARI: "ARI",
  ATL: "ATL",
  BAL: "BAL",
  BOS: "BOS",
  CHC: "CHC",
  CIN: "CIN",
  CLE: "CLE",
  COL: "COL",
  DET: "DET",
  HOU: "HOU",
  LAA: "LAA",
  LAD: "LAD",
  MIA: "MIA",
  MIL: "MIL",
  MIN: "MIN",
  NYM: "NYM",
  NYY: "NYY",
  OAK: "OAK",
  PHI: "PHI",
  PIT: "PIT",
  SEA: "SEA",
  STL: "STL",
  TEX: "TEX",
  TOR: "TOR",
};

const MLB_NAME_TO_ABBREV: Record<string, keyof typeof MLB_LOGOS> = {
  "arizona diamondbacks": "ARI",
  "atlanta braves": "ATL",
  "baltimore orioles": "BAL",
  "boston red sox": "BOS",
  "chicago cubs": "CHC",
  "chicago white sox": "CWS",
  "cincinnati reds": "CIN",
  "cleveland guardians": "CLE",
  "cleveland indians": "CLE",
  "colorado rockies": "COL",
  "detroit tigers": "DET",
  "houston astros": "HOU",
  "kansas city royals": "KC",
  "los angeles angels": "LAA",
  "la angels": "LAA",
  "los angeles dodgers": "LAD",
  "miami marlins": "MIA",
  "milwaukee brewers": "MIL",
  "minnesota twins": "MIN",
  "new york yankees": "NYY",
  "ny yankees": "NYY",
  "yankees": "NYY",
  "new york mets": "NYM",
  "ny mets": "NYM",
  "mets": "NYM",
  "oakland athletics": "OAK",
  "athletics": "OAK",
  "philadelphia phillies": "PHI",
  "pittsburgh pirates": "PIT",
  "san diego padres": "SD",
  "san francisco giants": "SF",
  "seattle mariners": "SEA",
  "st louis cardinals": "STL",
  "tampa bay rays": "TB",
  "texas rangers": "TEX",
  "toronto blue jays": "TOR",
  "washington nationals": "WSH",
};

export function normalizeMlbAbbrev(team: string): keyof typeof MLB_LOGOS | null {
  if (!team) return null;

  const trimmed = team.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (MLB_ABBREV_ALIASES[upper]) return MLB_ABBREV_ALIASES[upper];

  const key = normalizeKey(trimmed);

  if (key.includes("yankees")) return "NYY";
  if (key.includes("mets")) return "NYM";

  const byName = MLB_NAME_TO_ABBREV[key];
  if (byName) return byName;

  return null;
}

export function getMlbLogo(team: string): string {
  const abbrev = normalizeMlbAbbrev(team);
  if (!abbrev) return MLB_DEFAULT_LOGO;
  const code = MLB_LOGOS[abbrev];
  if (!code) return MLB_DEFAULT_LOGO;
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${code}.png`;
}

export function getMlbDefaultLogo(): string {
  return MLB_DEFAULT_LOGO;
}
