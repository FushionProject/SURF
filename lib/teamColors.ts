import type { SurfLeague } from "./surf/sports";

const NFL_TEAM_PRIMARY_RGB: Readonly<Record<string, string>> = {
  "Arizona Cardinals": "151,35,63",
  "Atlanta Falcons": "167,25,48",
  "Baltimore Ravens": "36,23,115",
  "Buffalo Bills": "0,51,141",
  "Carolina Panthers": "0,133,202",
  "Chicago Bears": "200,56,3",
  "Cincinnati Bengals": "251,79,20",
  "Cleveland Browns": "255,60,0",
  "Dallas Cowboys": "0,53,148",
  "Denver Broncos": "251,79,20",
  "Detroit Lions": "0,118,182",
  "Green Bay Packers": "255,184,28",
  "Houston Texans": "167,25,48",
  "Indianapolis Colts": "0,44,95",
  "Jacksonville Jaguars": "0,103,120",
  "Kansas City Chiefs": "227,24,55",
  "Las Vegas Raiders": "165,172,175",
  "Los Angeles Chargers": "0,128,198",
  "Los Angeles Rams": "0,53,148",
  "Miami Dolphins": "0,142,151",
  "Minnesota Vikings": "79,38,131",
  "New England Patriots": "198,12,48",
  "New Orleans Saints": "211,188,141",
  "New York Giants": "11,34,101",
  "New York Jets": "18,87,64",
  "Philadelphia Eagles": "0,76,84",
  "Pittsburgh Steelers": "255,182,18",
  "San Francisco 49ers": "170,0,0",
  "Seattle Seahawks": "105,190,40",
  "Tampa Bay Buccaneers": "213,10,10",
  "Tennessee Titans": "75,146,219",
  "Washington Commanders": "90,20,20",
};

const MLB_TEAM_PRIMARY_RGB: Readonly<Record<string, string>> = {
  "Arizona Diamondbacks": "167,25,48",
  Athletics: "0,56,49",
  "Oakland Athletics": "0,56,49",
  "Atlanta Braves": "206,17,65",
  "Baltimore Orioles": "223,70,1",
  "Boston Red Sox": "189,48,57",
  "Chicago Cubs": "14,51,134",
  "Chicago White Sox": "196,206,212",
  "Cincinnati Reds": "198,1,31",
  "Cleveland Guardians": "227,25,55",
  "Colorado Rockies": "51,0,111",
  "Detroit Tigers": "250,70,22",
  "Houston Astros": "235,110,31",
  "Kansas City Royals": "0,70,135",
  "Los Angeles Angels": "186,0,33",
  "Los Angeles Dodgers": "0,90,156",
  "Miami Marlins": "0,163,224",
  "Milwaukee Brewers": "255,197,47",
  "Minnesota Twins": "211,17,69",
  "New York Mets": "0,45,114",
  "New York Yankees": "0,48,135",
  "Philadelphia Phillies": "232,24,40",
  "Pittsburgh Pirates": "253,184,39",
  "San Diego Padres": "255,196,37",
  "San Francisco Giants": "253,90,30",
  "Seattle Mariners": "0,92,92",
  "St. Louis Cardinals": "196,30,58",
  "Tampa Bay Rays": "245,209,48",
  "Texas Rangers": "0,50,120",
  "Toronto Blue Jays": "19,74,142",
  "Washington Nationals": "171,0,3",
};

const FALLBACK_RGB: Record<SurfLeague, string> = {
  CFB: "0,229,255",
  NFL: "0,229,255",
  MLB: "232,24,40",
  NBA: "0,229,255",
};

export function getTeamPrimaryRgb(teamName: string, league: SurfLeague): string {
  if (league === "NFL") return NFL_TEAM_PRIMARY_RGB[teamName] ?? FALLBACK_RGB.NFL;
  if (league === "MLB") return MLB_TEAM_PRIMARY_RGB[teamName] ?? FALLBACK_RGB.MLB;
  return FALLBACK_RGB[league];
}
