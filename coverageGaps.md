# Test Coverage Gaps — next development round

Captured at the end of the `refactor-rolldvantage-architecture` change. The refactor
preserved behavior verbatim and added a real test suite where there was previously
**none** (golden-locked rendering, pure-unit coverage of every layer, a headless
`DungeonEditor` test, and 6 browser E2E flows). The items below are user-facing flows
that are implemented and unit-covered but **not yet exercised in a real browser (E2E)**,
plus a couple of smaller gaps. None are regressions; they are the next round's work.

Mock-boundary reminder: E2E and integration tests MUST have no mocks on the path under
test. Drive the real app via the `npm run dev` stack (Playwright `webServer`), exactly
as a human would.

## High priority (E2E — user-facing flows with no browser coverage)

### 1. Contents-Key pagination + responsive breakpoint
- **Spec:** `dungeon-editor` → "Maintain the Contents Key" (scenarios: reference letters track order; responsive layout switch).
- **Code:** `src/dungeon/contentsKey/contentsKeyView.ts` (`renderContentsKey`, `watchContentsKeyBreakpoint`), `src/dungeon/contentsKey/labels.ts` (`relabel`).
- **Covered:** label derivation / letter assignment / ordering (`labels.test.ts`).
- **Gap:** the measured multi-page split (desktop/print) and the single-column ≤700px layout, and re-render on crossing the 700px breakpoint, have no test.
- **Add:** an E2E that annotates enough features to force pagination, asserts multiple `.page` blocks with "Contents Key N" headings at desktop width, then resizes below 700px and asserts a single continuous column.

### 2. Structure-editing draw gestures (rooms / corridors / delete)
- **Spec:** `dungeon-editor` → "Edit dungeon structure" (add room, delete removes orphaned features, Esc exits a mode) and the default-tool drags.
- **Code:** `src/dungeon/controllers/structureModeController.ts`; mutations in `src/dungeon/editing/structureOps.ts`.
- **Covered:** `commitRoom` / `commitDelete` (orphan cleanup) as pure ops (`editing.test.ts`).
- **Gap:** the pointer gestures — Room rubber-band, Corridor click-start/click-end (+ live preview), Delete drag, default-tool left-drag (corridor vs room), right-drag erase, and `Esc` to exit — are not driven in a browser.
- **Add:** E2E covering: enter Room mode → drag rectangle → room appears; Corridor mode → click two cells → corridor appears; Delete mode → drag → region clears; `Esc` deactivates the mode (button loses `.active`, hint hides).

### 3. Secret conversion via UI (drag (S) + context menu)
- **Spec:** `dungeon-editor` → "Convert features to and from secret".
- **Code:** `secretOps.ts` (logic), `dragPlaceController.ts` (drop/move (S)), `contextMenuController.ts` (Make/Make-Not Secret).
- **Covered:** `convertSecretAt` / `unconvertSecret` inverse property as pure ops (`editing.test.ts`).
- **Gap:** no E2E that drops the (S) legend icon on a room/corridor and asserts it appears on the DM map but not the player map (and the reverse).
- **Add:** E2E asserting a secret room/passage is DM-only (`#dm-map` shows the dashed gold outline / `(S)` badge; `#player-map` does not).

### 4. Annotation dialog end-to-end (double-click + Contents-Key click)
- **Spec:** `dungeon-editor` → "Annotate features with notes" and the XSS guard scenario.
- **Code:** `noteModalController.ts`; model side in `noteOps.ts`; escaping in `labels.esc`.
- **Covered:** `applyNote` / `removeNote` and `esc()` escaping as pure units (`editing.test.ts`, `labels.test.ts`).
- **Gap:** the modal flow (double-click a feature → type note → save → it appears in the Contents Key; clear → it disappears) and the **DOM-level XSS** assertion are not in a browser.
- **Add:** E2E that double-clicks a room, enters `<img src=x onerror=...>` as the note, saves, and asserts the Contents Key shows the literal text with no script execution (set a `window.__xss` flag in `onerror` and assert it never fires).

## Medium priority

### 5. Inline-editable name / depth / flavor
- **Spec:** `dungeon-editor` → "Edit dungeon name, depth, and flavor inline".
- **Code:** `toolbarController.ts` (`wireEditable`, flavor handlers).
- **Covered:** the load E2E asserts DM/player name are in sync after load.
- **Gap:** no test that *edits* the name on the DM map and asserts the player copy + running foot-name update and the dungeon object's `name` changes (and persists through Save).

### 6. Chronicle behaviour (scaling + field persistence + clear)
- **Spec:** `dungeon-editor` → "Chronicle page scaling and field persistence".
- **Code:** `src/chronicle/pageScaling.ts`, `fieldPersistence.ts`, `chronicleToolbar.ts`.
- **Covered:** none directly (split verbatim from the original).
- **Add:** a jsdom unit test for `setupFieldPersistence` (type into a `[data-key]` field → value saved under the namespaced key → restored on re-init; `clearAll` wipes it). Page scaling can stay E2E-only or be left as a visual check.

## Low priority

### 7. PDF export (bleed layout)
- **Spec:** `dungeon-editor` → "Export a print-ready PDF layout".
- **Code:** `toolbarController.ts` (export handler), `afterprint` cleanup.
- **Gap:** hard to assert headlessly (invokes `window.print()`); untested before and after the refactor.
- **Add (optional):** an E2E that stubs `window.print`, clicks Export, and asserts the `pdf-bleed` class + `@page` style are applied then removed on `afterprint`.

### 8. Lint the e2e specs
- `eslint.config.js` currently ignores `e2e/` and `playwright.config.ts` (they are outside the typed `tsconfig` projects).
- **Add (optional):** a dedicated `tsconfig.e2e.json` and an eslint override so the Playwright specs are type-checked/linted too.
