#!/bin/bash
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$HOME/surf-main"
pkill -f "next dev" >/dev/null 2>&1 || true
sleep 1
NEXT_PUBLIC_SURF_TEAM_MARKS=text nohup npm run dev -- --port 3000 > /tmp/surf-dev.log 2>&1 &
sleep 22
echo "HTTP $(curl -s -o /dev/null -w '%{http_code}' -m 25 http://localhost:3000/games)"
grep -iE 'Ready|Local:|error' /tmp/surf-dev.log | head -4
