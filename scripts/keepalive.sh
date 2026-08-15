#!/usr/bin/env bash
# Keep the Render free-tier backend awake.
# Run this script continuously, or rely on UptimeRobot / GitHub Actions instead.
set -euo pipefail

URL="${1:-https://documentai-backend-snp3.onrender.com/api/health/}"
INTERVAL="${2:-300}"

echo "Pinging $URL every ${INTERVAL}s (Ctrl+C to stop)..."
while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$URL") || true
  echo "$(date -u +%H:%M:%S) -> HTTP $code"
  sleep "$INTERVAL"
done
