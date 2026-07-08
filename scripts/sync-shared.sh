#!/usr/bin/env bash
# Sync the SHARED wallet-core from the desktop wallet into this mobile app.
#
# Use this if you keep desktop and mobile as separate checkouts instead of a shared branch/package.
# It copies ONLY the platform-neutral, reused files — never touches src/mobile/ or native config.
#
# Usage: scripts/sync-shared.sh /path/to/keryx-desktop-wallet
set -euo pipefail

DESKTOP="${1:?Usage: sync-shared.sh /path/to/keryx-desktop-wallet}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

for d in sdk lib screens components; do
  echo "syncing src/$d …"
  rsync -a --delete "$DESKTOP/src/$d/" "$HERE/src/$d/"
done
# Shared top-level frontend files (do NOT overwrite mobile vite/capacitor config).
for f in src/App.tsx src/main.tsx src/index.css; do
  cp "$DESKTOP/$f" "$HERE/$f"
done

echo "Done. Review 'git diff', then run: npm test"
