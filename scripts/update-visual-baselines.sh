#!/usr/bin/env bash
# Update Playwright screenshot baselines.
#
# Usage:
#   ./scripts/update-visual-baselines.sh             # update all visual specs
#   ./scripts/update-visual-baselines.sh auth        # update only specs matching "auth"
#
# After running, review the diff in tests/e2e/*-snapshots/ and commit the
# new PNGs together with the UI change that produced them. CI will fail
# on any unexpected diff (see .github/workflows/e2e.yml).
set -euo pipefail

FILTER="${1:-visual-regression}"

echo "→ Installing Chromium if missing..."
bunx playwright install chromium >/dev/null

echo "→ Updating snapshots for: ${FILTER}"
bunx playwright test "${FILTER}" --update-snapshots --reporter=list

echo
echo "✓ Done. Review changes:"
echo "    git status tests/e2e"
echo "    git diff --stat tests/e2e"
echo
echo "Commit baselines alongside the UI change so CI passes."