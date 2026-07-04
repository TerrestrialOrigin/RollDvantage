#!/usr/bin/env bash
# ============================================================
# validate-all.sh — cross-repo validation for the RPGStuff workspace.
#
# Runs the full gate set across both repos that participate in the
# generator extraction:
#   * auto-stuff-generator — the published library (lint + type-check + test + build)
#   * rolldvantage         — the consuming app (lint + unit/integration tests + web build)
#
# rolldvantage must consume auto-stuff-generator as the PUBLISHED package
# (no npm link / file: / relative-path dependency). This script fails loudly
# if a link/relative dependency has crept back in.
#
# This script lives in the rolldvantage repo (rolldvantage/scripts/) but
# orchestrates the whole workspace, so it resolves the workspace ROOT two levels
# up and expects auto-stuff-generator as a sibling of rolldvantage.
#
# Usage:  (from the rolldvantage repo root)  npm run validate
#         or directly                        bash scripts/validate-all.sh
# Exits non-zero on the first failing step.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIBRARY_DIR="$ROOT/auto-stuff-generator"
CONSUMER_DIR="$ROOT/rolldvantage"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# ---- 1. Library: lint + type-check + test + build (the build script gates all of these) ----
step "auto-stuff-generator — build (lint + type-check + jest + bundle + types)"
( cd "$LIBRARY_DIR" && npm run build )

# ---- 2. Guard: consumer must NOT depend on the library via a link / file / relative path ----
step "rolldvantage — dependency hygiene (no link:/file:/relative path to auto-stuff-generator)"
if grep -nE '"auto-stuff-generator"\s*:\s*"(link:|file:|\.\.?/)' "$CONSUMER_DIR/package.json"; then
  echo "ERROR: rolldvantage depends on auto-stuff-generator via a link/file/relative path." >&2
  echo "       The shipped product must reference the published package (a semver range)." >&2
  exit 1
fi
if [ -L "$CONSUMER_DIR/node_modules/auto-stuff-generator" ]; then
  echo "ERROR: node_modules/auto-stuff-generator is a symlink (npm link still active)." >&2
  echo "       Run 'npm install' against the published package before validating." >&2
  exit 1
fi
echo "OK — auto-stuff-generator is a normal (published) dependency."

# ---- 3. Consumer: lint + tests + web build ----
step "rolldvantage — lint"
( cd "$CONSUMER_DIR" && npm run lint )

step "rolldvantage — unit + integration tests"
( cd "$CONSUMER_DIR" && npx vitest run )

step "rolldvantage — web build"
( cd "$CONSUMER_DIR" && npm run build-web )

# ---- 4. Consumer: end-to-end tests (real browser, full dev stack) ----
step "rolldvantage — e2e (Playwright; auto-starts the dev stack the human way)"
( cd "$CONSUMER_DIR" && npx playwright test )

printf '\n\033[1;32mAll validation steps passed.\033[0m\n'
