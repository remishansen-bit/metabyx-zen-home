#!/usr/bin/env bash
# Update Playwright screenshot baselines.
#
# Usage:
#   ./scripts/update-visual-baselines.sh                       # all visual specs
#   ./scripts/update-visual-baselines.sh --screen auth         # only screens matching "auth"
#   ./scripts/update-visual-baselines.sh --screens auth,onboarding
#   ./scripts/update-visual-baselines.sh --allowlist           # only screens in VISUAL_ALLOWLIST
#
# Environment:
#   VISUAL_ALLOWLIST="auth,onboarding"   # used with --allowlist
#
# CI never runs --update-snapshots, so any unexpected diff fails the build.
# Always review and commit the regenerated PNGs alongside the UI change.
set -euo pipefail

FILTER="visual-regression"
SCREENS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --screen|--screens)
      SCREENS="${2:-}"; shift 2 ;;
    --allowlist)
      SCREENS="${VISUAL_ALLOWLIST:-}"
      if [[ -z "$SCREENS" ]]; then
        echo "✗ --allowlist requires VISUAL_ALLOWLIST env var (comma-separated screen names)" >&2
        exit 2
      fi
      shift ;;
    --filter)
      FILTER="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,15p' "$0"; exit 0 ;;
    *)
      FILTER="$1"; shift ;;
  esac
done

echo "→ Installing Chromium if missing..."
bunx playwright install chromium >/dev/null

if [[ -n "$SCREENS" ]]; then
  # Convert comma-separated screen names into a Playwright -g regex.
  GREP="visual: ($(echo "$SCREENS" | tr ',' '|' | tr -d ' '))"
  echo "→ Updating snapshots for screens: $SCREENS"
  bunx playwright test "$FILTER" -g "$GREP" --update-snapshots --reporter=list
else
  echo "→ Updating snapshots for: $FILTER"
  bunx playwright test "$FILTER" --update-snapshots --reporter=list
fi

echo
echo "✓ Done. Review:  git status tests/e2e  &&  git diff --stat tests/e2e"
echo "Commit baselines alongside the UI change so CI passes."