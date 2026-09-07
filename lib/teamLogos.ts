import { getMlbLogo } from "./mlbLogos";
import { getCfbTeamLogo } from "./cfbTeamLogos";
import type { SurfLeague } from "./surf/sports";

export const TEAM_LOGOS: Record<string, string> = {
  "Los Angeles Lakers": "lal",
  "New York Knicks": "ny",
  "Boston Celtics": "bos",
  "Miami Heat": "mia",
  "Chicago Bulls": "chi",
  "Golden State Warriors": "gs",
  "Brooklyn Nets": "bkn",
  "Dallas Mavericks": "dal",
  "Denver Nuggets": "den",
  "Philadelphia 76ers": "phi",
  "Phoenix Suns": "phx",
  "Milwaukee Bucks": "mil",
  "Toronto Raptors": "tor",
  "Atlanta Hawks": "atl",
  "Orlando Magic": "orl",
  "Indiana Pacers": "ind",
  "Cleveland Cavaliers": "cle",
  "Detroit Pistons": "det",
  "San Antonio Spurs": "sa",
  "Houston Rockets": "hou",
  "Memphis Grizzlies": "mem",
  "New Orleans Pelicans": "no",
  "Oklahoma City Thunder": "okc",
  "Utah Jazz": "utah",
  "Sacramento Kings": "sac",
  "Portland Trail Blazers": "por",
  "Minnesota Timberwolves": "min",
  "LA Clippers": "lac",
  "Charlotte Hornets": "cha",
  "Washington Wizards": "wsh",
};

const NFL_TEAM_LOGOS: Record<string, string> = {
  "Arizona Cardinals": "ari",
  "Atlanta Falcons": "atl",
  "Baltimore Ravens": "bal",
  "Buffalo Bills": "buf",
  "Carolina Panthers": "car",
  "Chicago Bears": "chi",
  "Cincinnati Bengals": "cin",
  "Cleveland Browns": "cle",
  "Dallas Cowboys": "dal",
  "Denver Broncos": "den",
  "Detroit Lions": "det",
  "Green Bay Packers": "gb",
  "Houston Texans": "hou",
  "Indianapolis Colts": "ind",
  "Jacksonville Jaguars": "jax",
  "Kansas City Chiefs": "kc",
  "Las Vegas Raiders": "lv",
  "Los Angeles Chargers": "lac",
  "Los Angeles Rams": "lar",
  "Miami Dolphins": "mia",
  "Minnesota Vikings": "min",
  "New England Patriots": "ne",
  "New Orleans Saints": "no",
  "New York Giants": "nyg",
  "New York Jets": "nyj",
  "Philadelphia Eagles": "phi",
  "Pittsburgh Steelers": "pit",
  "San Francisco 49ers": "sf",
  "Seattle Seahawks": "sea",
  "Tampa Bay Buccaneers": "tb",
  "Tennessee Titans": "ten",
  "Washington Commanders": "wsh",
};

export function getTeamLogo(teamName: string, league?: SurfLeague) {
  if (league === "CFB") return getCfbTeamLogo(teamName);
  if (league === "MLB") return getMlbLogo(teamName);
  if (league === "NFL") {
    const code = NFL_TEAM_LOGOS[teamName];
    return code ? `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png` : null;
  }
  const code = TEAM_LOGOS[teamName];
  if (!code) return null;
  return `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png`;
}
