#!/usr/bin/env bash
# Type-check (tsc) and test (vitest) a clean copy of this repo.
#
# Why a copy: running tsc/vitest straight against the mounted Day Planner
# folder hits "Resource deadlock avoided" errors on a few files that are held
# open on the Mac, so we rsync the source (no node_modules/.next/.git) to a
# local work dir and check there.
#
# Why /tmp: the Cowork workspace's per-session home lives on a small disk
# (/sessions) that fills up with leftover session folders it can't clean up
# (see anthropics/claude-code#59856). /tmp is on the roomier root partition,
# so the copy, node_modules, and npm cache all live there instead.
#
# Usage:   bash scripts/verify.sh
# Override the work dir with VERIFY_DIR=/some/path bash scripts/verify.sh
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/"
WORK="${VERIFY_DIR:-/tmp/blueprint-check}"
NEED_KB=$((1500 * 1024)) # node_modules (~800 MB) + copy + npm cache, with headroom

mkdir -p "$WORK"
export npm_config_cache="$WORK/.npm-cache"
export npm_config_update_notifier=false

rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .npm-cache --exclude .lock-last --exclude _to_delete \
  "$SRC" "$WORK/"

cd "$WORK"

if [ ! -d node_modules ] || ! cmp -s package-lock.json .lock-last 2>/dev/null; then
  free_kb=$(df -Pk "$WORK" | awk 'NR==2 {print $4}')
  if [ "$free_kb" -lt "$NEED_KB" ]; then
    echo "Not enough free space in $WORK ($((free_kb / 1024)) MB free, need ~$((NEED_KB / 1024)) MB)." >&2
    echo "Point VERIFY_DIR at a roomier disk, or run the checks in the cloud container instead." >&2
    exit 2
  fi
  echo "== npm ci =="
  npm ci --no-audit --no-fund
  cp package-lock.json .lock-last
fi

# Regenerates Next's typed-route stubs (tsc's include covers .next/types).
# A full `next build` isn't needed and can hang on missing env vars.
npx next typegen >/dev/null 2>&1 || true

echo "== tsc =="
npx tsc --noEmit
echo "tsc OK"

echo "== vitest =="
npx vitest run
