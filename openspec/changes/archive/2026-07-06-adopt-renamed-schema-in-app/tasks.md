# Tasks — adopt-renamed-schema-in-app (page-size companion)

## 1. Migrate the persisted payload

- [x] 1.1 `src/chronicle/pageSize.ts` `savePersisted`: write `{ width: size.width, height: size.height, unit: size.unit }`.
- [x] 1.2 `loadPersisted`: read new keys and read-migrate legacy `{ w, h }` via `validateCustom(parsed.width ?? parsed.w, parsed.height ?? parsed.h, unit)`; keep the corrupt-payload → `null` → default-resolution fallback. Update the stale "legacy compact {w,h}" / "byte-compatible" comments.

## 2. Tests

- [x] 2.1 `src/chronicle/pageSize.test.ts`: flip the persisted-shape assertion to `{ width, height, unit }`; add a legacy `{ w, h, unit }` read-migration case; keep the corrupt/invalid-payload fallback cases.

## 3. Testing & Verification

- [x] 3.1 Covered by the root change's full vitest + e2e + validate gates (this change touches only `pageSize.ts`/`pageSize.test.ts`). Confirm `vitest run` green with these cases and no weakened assertions.
