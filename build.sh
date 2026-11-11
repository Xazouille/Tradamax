#!/usr/bin/env bash
# Prépare le dossier « site » publié : l'application + le calendrier économique de la semaine.
# Utilisé par GitHub Actions (et par Cloudflare Pages si vous choisissez cet hébergeur).
set -euo pipefail

rm -rf site
mkdir -p site/data
cp index.html app.js config.js site/

URL="https://nfs.faireconomy.media/ff_calendar_thisweek.json"
if curl -sSfL --retry 3 --max-time 30 "$URL" -o site/data/calendar.json \
   && python3 -c "import json,sys; d=json.load(open('site/data/calendar.json')); sys.exit(0 if isinstance(d,list) else 1)"; then
  echo "Calendrier récupéré."
else
  echo "Calendrier indisponible : publication sans données." >&2
  echo "[]" > site/data/calendar.json
fi
date -u +%Y-%m-%dT%H:%M:%SZ > site/data/calendar-updated.txt
