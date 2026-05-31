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

# ── Stale-deploy guard ─────────────────────────────────────────────
# Production is ONE shared alias and `vercel --prod` ships whatever's in
# THIS working tree — so whoever deploys last wins. With multiple
# worktrees/branches in play, a deploy from a branch that's behind main
# silently rolls production back (and can ship unreviewed code). Refuse
# unless this tree's HEAD is exactly origin/main and the tree is clean.
# Emergency override: ./deploy.sh --allow-stale
ALLOW_STALE=0
for arg in "$@"; do [ "$arg" = "--allow-stale" ] && ALLOW_STALE=1; done

if [ "$ALLOW_STALE" -ne 1 ]; then
  echo "Checking this tree is up-to-date main before deploying..."
  git -C "$SCRIPT_DIR" fetch origin --quiet
  LOCAL=$(git -C "$SCRIPT_DIR" rev-parse HEAD)
  REMOTE_MAIN=$(git -C "$SCRIPT_DIR" rev-parse origin/main)
  BRANCH=$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD)
  DIRTY=$(git -C "$SCRIPT_DIR" status --porcelain | wc -l | tr -d ' ')

  if [ "$LOCAL" != "$REMOTE_MAIN" ]; then
    echo ""
    echo "ERROR: refusing to deploy — this tree is NOT at origin/main."
    echo "  branch:      $BRANCH"
    echo "  HEAD:        ${LOCAL:0:12}"
    echo "  origin/main: ${REMOTE_MAIN:0:12}"
    echo ""
    echo "Deploying from a stale branch overwrites production with old code."
    echo "Deploy current main from an isolated checkout instead:"
    echo "  git fetch origin && git worktree add --detach /tmp/afl-prod origin/main"
    echo "  cp -r .vercel /tmp/afl-prod/.vercel && cd /tmp/afl-prod && ./deploy.sh"
    echo ""
    echo "(Emergency override only if you KNOW this tree should ship: ./deploy.sh --allow-stale)"
    exit 1
  fi
  if [ "$DIRTY" -ne 0 ]; then
    echo ""
    echo "ERROR: refusing to deploy — $DIRTY uncommitted change(s) in this tree."
    echo "Commit/stash them (so prod matches a real commit), or use --allow-stale."
    exit 1
  fi
  echo "OK — at origin/main (${LOCAL:0:12}), clean tree."
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
