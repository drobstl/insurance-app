#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_URL="https://agentforlife.app"

if [ ! -f "$SCRIPT_DIR/web/next.config.ts" ]; then
  echo "ERROR: web/next.config.ts not found. Are you in the insurance-app repo?"
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/.vercel/project.json" ]; then
  echo "ERROR: .vercel/project.json not found at repo root."
  echo "Run: vercel link   (from the repo root, link to the 'web' project)"
  exit 1
fi

echo "Deploying AgentForLife web project to production..."
echo ""

cd "$SCRIPT_DIR"
vercel --prod --yes

echo ""
echo "Waiting for deployment to propagate..."
sleep 8

FAIL=0

check_page() {
  local url="$1"
  local expected="$2"
  local label="$3"
  local title
  title=$(curl -sL --max-time 10 "$url" | grep -o '<title>[^<]*</title>' | head -1)
  if echo "$title" | grep -qi "$expected"; then
    echo "  PASS  $label"
    echo "        $title"
  else
    echo "  FAIL  $label"
    echo "        Expected title containing: $expected"
    echo "        Got: ${title:-<empty>}"
    FAIL=1
  fi
}

echo ""
echo "Verifying all pages..."
echo ""
check_page "$SITE_URL"              "AgentForLife"           "Landing Page  ($SITE_URL)"
check_page "$SITE_URL/booking"      "Schedule An Interview"  "Booking Page  ($SITE_URL/booking)"
check_page "$SITE_URL/agent-guide"  "Agent Resource Guide"   "Agent Guide   ($SITE_URL/agent-guide)"

echo ""
if [ $FAIL -eq 0 ]; then
  echo "All pages verified. Deployment successful."
else
  echo "WARNING: One or more pages failed verification!"
  echo "Check the Vercel dashboard: https://vercel.com/agent-for-life/web"
  exit 1
fi
