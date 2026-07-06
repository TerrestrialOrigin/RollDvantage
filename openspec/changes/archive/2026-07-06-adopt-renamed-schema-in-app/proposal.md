## Why

Owner Directive 2 (total naming purge) requires the app to eliminate every abbreviated identifier it owns. The `PageSize` persisted `localStorage` payload uses the compact `{w,h,unit}` keys. This companion to the root `adopt-renamed-schema-in-app` change (which handles the dungeon model + file-format v2) migrates the persisted page-size payload to full-name keys without losing sizes saved under the old shape.

## What Changes

- `savePersisted` writes `{ width, height, unit }` instead of `{ w, h, unit }`.
- `loadPersisted` reads the new keys and **read-migrates** a legacy `{ w, h }` payload (accept both on read, write new), so a size saved before the rename still restores. A corrupt legacy payload still falls back to the default resolution order.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `page-size-selection`: "Persistence of the selection" — the persisted payload uses `width`/`height` keys and read-migrates the legacy `w`/`h` shape.

## Impact

- **Code:** `src/chronicle/pageSize.ts` (`savePersisted`/`loadPersisted`) and `src/chronicle/pageSize.test.ts`.
- **Data:** the `pageSize` localStorage payload key names. No behavior change — sizes persist and restore across the rename.
