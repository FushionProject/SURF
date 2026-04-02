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

export function getTeamLogo(teamName: string) {
  const code = TEAM_LOGOS[teamName];
  if (!code) return null;
  return `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png`;
}
