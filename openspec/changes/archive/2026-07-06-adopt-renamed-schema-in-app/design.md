# Design — adopt-renamed-schema-in-app (page-size companion)

## Context

`PageSize` (runtime) already uses `width`/`height`. Only the persisted `localStorage` payload keeps the compact legacy `{ w, h, unit }` shape (`savePersisted` writes it; `loadPersisted` reads `parsed.w`/`parsed.h`). Directive 2 removes the abbreviated keys. Because real users have sizes already saved under `{ w, h }`, the read path must migrate transparently.

## Decisions

### D1 — Write full-name keys; read both

- `savePersisted` writes `{ width: size.width, height: size.height, unit: size.unit }`.
- `loadPersisted` validates `validateCustom(parsed.width ?? parsed.w, parsed.height ?? parsed.h, unit)`. New keys win; legacy keys are the fallback. The next `set()` re-persists under the new keys, so a payload is migrated on first change.

### D2 — Validation unchanged

The migration only chooses which keys feed `validateCustom`; the existing validation (reject non-numeric/zero/negative/NaN, clamp to 3in–48in, guard CSS injection into `--page-w`/`--page-h`) is untouched. A corrupt payload under either key set still yields `null` → default resolution.

## Test Strategy

- `pageSize.test.ts`: flip the persisted-shape assertion to `{ width, height, unit }`; add a case that seeds a legacy `{ w, h, unit }` payload and asserts it restores (read-migration); keep the corrupt/invalid-payload fallback cases (now exercised under legacy keys, proving both paths validate).
- Covered by the app's full vitest gate in the root change.

## User-Error Scenarios

1. **User has a size saved under legacy `{w,h}`** → read-migrated; selection survives; re-saved as `{width,height}` on next change.
2. **Corrupt/partial payload (either key set)** → `validateCustom` returns `null`; app falls back to locale/Letter default; no crash.

## Security Analysis

- **T1 — CSS injection via persisted dimensions.** Unchanged: `validateDimension` uses `Number(...)` (rejecting trailing garbage like `"10in; }"`), so only real numbers reach the CSS variables. The key-name migration does not alter validation.
