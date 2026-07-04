## 1. Prototype: can print content zoom-fill without knowing the paper? (blocks D4 stretch)

- [x] 1.1 In **real** Firefox (Mozilla Save to PDF) and Chromium, test whether page content can be scaled to fill the printed sheet without knowing the paper size. **RESULT: yes.** A clean `height:100%` chain (`html→body→.page`) plus scalable content (SVG `viewBox`) fills 99%×99% of every sheet, multi-page (3/3), in Firefox (A4) and Chromium (Letter + A4). `vh`/`min-vh` under-fill (91%); the old `display:contents`+absolute-frame nesting was what blocked filling, not a Firefox limit.
- [x] 1.2 **Decision (revised at group-4 checkpoint): print content zoom-fill is OUT.** The `height:100%` chain fills in isolation but the real multi-page structure hits a Firefox `%`-height-in-fragmentation limit (only page 1 fills). Pragmatic path: on-screen content scaling + keep the shipped print auto-fit (overlay/flow) which is correct on any paper. Print zoom-fill deferred. Recorded in design.md D4.

## 2. Geometry source of truth (no behavior change)

- [x] 2.1 Make the page shell (`.page`, `.page-wrap`) read `--page-w` / `--page-h`; keep current Letter values — `.page` already used `var(--page-w/h)`; confirmed no other page-dimension literals leak
- [x] 2.2 Refactor frame insets, `.page-foot`, cover, and Contents Key sizing to reference the variables — audit found the only hard-coded page dimension was `pageScaling.ts` (2.4); frame/foot/cover use fixed offsets (kept as-is, no `8.5in`/`11in` literals)
- [x] 2.3 Set `@page { size: var(--page-w) var(--page-h) }` — verified `var()` in `@page size` resolves in Chromium (real app print MediaBox = 612×792 Letter)
- [x] 2.4 Update `src/chronicle/pageScaling.ts` so the natural width comes from `--page-w` (measured probe, unit-agnostic), not the `8.5*96` constant
- [x] 2.5 Verify visual + print parity (Letter default): tsc clean; unit 41/41; e2e 10/10 incl. print specs in Chromium + Firefox; Chromium print still Letter-sized

## 3. Page-size selection + persistence

- [x] 3.1 Page-size module (`src/chronicle/pageSize.ts`): presets (Letter/A4/Legal), default resolution (persisted → locale → Letter), custom validation/clamping (3–48in, rejects 0/negative/NaN/non-numeric)
- [x] 3.2 Persist/restore in `localStorage` (`dungeon_pageSize`) with defensive try/catch parse (corrupt → default) — verified A4 survives reload
- [x] 3.3 Apply writes `--page-w`/`--page-h` from validated numbers + fixed unit only (no raw strings) — verified page shell resizes; injection guarded (ThreatModel T1/T2)
- [x] 3.4 Top-right chrome paper icon + popup (`src/chronicle/pageSizeControl.ts`): presets + custom W×H + unit, inline validation message, Esc/outside-click close, screen-only — verified invalid input rejected & retained previous size

## 4. Make content scale to the selected size

- [x] 4.1 Map SVG (already has `viewBox`) now sizes `width:100%` of the framed area → scales with page size on screen; capped `max-height:6in` in normal print so it fits one sheet (verified 3 pages Chromium + Firefox)
- [x] 4.2 Contents Key paginates against the live frame height (reflects `--page-h`) and stays `fr`-free in print (shipped) — re-paginates on size change
- [x] 4.3 Re-render maps + Contents Key on page-size change via `chronicle:pagesizechange` event — verified 13/13 entries preserved switching to A4, no reload
- [x] 4.4 `position:fixed` overlay stays the single print border (shipped) — no double border

## 5. Print model stays as shipped (per group-4 decision)

- [x] 5.1 Kept the shipped `:not(.pdf-bleed)` print model (overlay border + flow + break-after) — confirmed it still prints correctly with on-screen scaling + `@page` var (Chromium 3 pages, Firefox real-print 3 pages)
- [x] 5.2 Full-bleed export (`html.pdf-bleed`) verified untouched — 3 pages at 8.75×11.25, parchment + crop marks intact

## 6. Testing & Verification

- [x] 6.1 Unit tests (`pageSize.test.ts`, 16): resolution order, locale heuristic, validation/clamping (in + mm), corrupt-persistence fallback, CSS-injection rejection (T1–T3). Caught a `parseFloat` hole → hardened to `Number()`.
- [x] 6.2 E2E: changing size updates `--page-w` and re-paginates the Contents Key live, no reload, no entry loss (`pageSize.spec.ts`)
- [x] 6.3 Real-print verified: Chromium e2e prints Letter (612×792) **and** A4 (595×842), one sheet per section; Firefox real-print (Mozilla Save to PDF harness) = 3 pages, auto-fits, full border. (Firefox real-print runs via the standalone harness, not the Playwright project, which can't print-to-PDF; FF forced-break structure covered by `printPageBreaks`.)
- [x] 6.4 E2E: page width differs Letter vs A4 (proportional resize); visual parity confirmed on-screen
- [x] 6.5 Regression: `printPageBreaks` + `printPdfPagination` green both engines; full-bleed export verified (3 pages, 8.75×11.25, parchment + crop marks)
- [x] 6.6 Delta-spec scenarios covered; lint + `vitest` (57) + `build-web` + e2e (15) all green. Validate script unchanged (no new build targets; specs auto-discovered).
