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
# auto-stuff-generator is an npm-workspaces monorepo: LIBRARY_DIR is the WORKSPACE ROOT,
# and its root `build` script fans out to every workspace package (`npm run build
# --workspaces --if-present`), each running its own lint + type-check + jest + bundle + types.
step "auto-stuff-generator — workspace build (fans out: lint + type-check + jest + bundle + types)"
( cd "$LIBRARY_DIR" && npm run build --workspaces --if-present )

# ---- 2. Guard: consumer must consume every published dependency from the registry ----
# The shipped product must reference published packages (semver ranges resolving to
# registry.npmjs.org) — never a link:/file:/relative/local-tarball path. We check three
# layers so a local dependency cannot slip through any of them:
#   (a) package.json text     — an obvious link:/file:/relative range
#   (b) node_modules symlink  — an active `npm link`
#   (c) package-lock.json     — the RESOLVED url (catches a lockfile-only local tarball
#                               that leaves package.json looking clean)
# Guarded packages: the extracted library plus the cross-platform-util family.
GUARDED_DEPS=(auto-stuff-generator cross-platform-util cross-platform-util-types)

# Print the "resolved" value of the top-level node_modules/<dep> lockfile block.
lockfile_resolved() {
  local dep="$1"
  awk -v key="    \"node_modules/$dep\": {" '
    $0 == key { inblock = 1; next }
    inblock && /^    }/ { inblock = 0 }
    inblock && /"resolved":/ {
      sub(/.*"resolved": "/, ""); sub(/".*/, ""); print; exit
    }
  ' "$CONSUMER_DIR/package-lock.json"
}

step "rolldvantage — dependency hygiene (published deps only: no link:/file:/relative/local-tarball)"
for dep in "${GUARDED_DEPS[@]}"; do
  # (a) package.json text
  if grep -nE "\"$dep\"\s*:\s*\"(link:|file:|\.\.?/)" "$CONSUMER_DIR/package.json"; then
    echo "ERROR: rolldvantage depends on $dep via a link/file/relative path in package.json." >&2
    echo "       The shipped product must reference the published package (a semver range)." >&2
    exit 1
  fi
  # (b) node_modules symlink (active npm link)
  if [ -L "$CONSUMER_DIR/node_modules/$dep" ]; then
    echo "ERROR: node_modules/$dep is a symlink (npm link still active)." >&2
    echo "       Run 'npm install' against the published package before validating." >&2
    exit 1
  fi
  # (c) lockfile resolved url must point at the npm registry
  resolved="$(lockfile_resolved "$dep")"
  if [[ "$resolved" != https://registry.npmjs.org/* ]]; then
    echo "ERROR: lockfile resolution for '$dep' is not an npm-registry url: '${resolved:-<none>}'." >&2
    echo "       A file:/link:/local-tarball resolution must not ship in the product." >&2
    exit 1
  fi
  echo "OK — $dep is a normal (registry-published) dependency."
done

# ---- 3. Consumer: lint + tests + web build ----
step "rolldvantage — lint"
( cd "$CONSUMER_DIR" && npm run lint )

# The e2e specs are type-aware LINTED, but lint can be skipped/relaxed per-rule;
# a standalone type-check guarantees a type error in a Playwright spec fails the build.
step "rolldvantage — e2e type-check (tsc -p tsconfig.e2e.json --noEmit)"
( cd "$CONSUMER_DIR" && npx tsc -p tsconfig.e2e.json --noEmit )

step "rolldvantage — unit + integration tests (with coverage threshold)"
( cd "$CONSUMER_DIR" && npx vitest run --coverage )

step "rolldvantage — web build"
( cd "$CONSUMER_DIR" && npm run build-web )

# ---- 4. Consumer: end-to-end tests (real browser, full dev stack) ----
step "rolldvantage — e2e (Playwright; auto-starts the dev stack the human way)"
( cd "$CONSUMER_DIR" && npx playwright test )

# ---- 5. Consumer: real print-pipeline gate (Chromium + Firefox "Save to PDF") ----
# The strongest print check drives the ACTUAL print pipeline (not emulateMedia),
# so a print-layout regression fails validation. It spawns its own dev server.
step "rolldvantage — print-check (real Chromium + Firefox print pipeline)"
( cd "$CONSUMER_DIR" && npm run print-check )

printf '\n\033[1;32mAll validation steps passed.\033[0m\n'
