## 1. Prototype: can print content zoom-fill without knowing the paper? (blocks D4 stretch)

- [x] 1.1 In **real** Firefox (Mozilla Save to PDF) and Chromium, test whether page content can be scaled to fill the printed sheet without knowing the paper size. **RESULT: yes.** A clean `height:100%` chain (`html→body→.page`) plus scalable content (SVG `viewBox`) fills 99%×99% of every sheet, multi-page (3/3), in Firefox (A4) and Chromium (Letter + A4). `vh`/`min-vh` under-fill (91%); the old `display:contents`+absolute-frame nesting was what blocked filling, not a Firefox limit.
- [x] 1.2 **Decision: print content zoom-fill is IN scope.** Approach = clean `height:100%` chain + scalable (SVG/relative) content, no paper detection. This likely **retires** the `position:fixed` overlay rather than keeping it as a fallback (to be confirmed once the decorative border is proven to fill via the same chain). Recorded in design.md D4.

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

- [ ] 4.1 Map rendering: ensure the SVG uses a `viewBox` and sizes to `width:100%` of the framed area so it scales to any page size (`src/dungeon/rendering/*`)
- [ ] 4.2 Contents Key: measure/reserve against the live `--page-h` frame and re-paginate on page-size change; keep columns `fr`-free in print (`src/dungeon/contentsKey/contentsKeyView.ts`)
- [ ] 4.3 Re-render maps + Contents Key on page-size change without reload or data loss
- [ ] 4.4 Keep the `position:fixed` overlay as the primary print border (auto-fits any sheet); suppress the in-flow `.frame` border in normal print so exactly one border prints

## 5. Retire / gate the paper-specific workarounds

- [ ] 5.1 Where the scaled model makes them unnecessary, simplify the `:not(.pdf-bleed)` print workarounds — only while the real-print e2e stays green
- [ ] 5.2 Confirm the full-bleed export (`html.pdf-bleed`) path is untouched and still renders trim+bleed + crop marks

## 6. Testing & Verification

- [ ] 6.1 Unit tests: default resolution order, locale heuristic, custom-size validation/clamping, corrupt-persistence fallback, CSS-injection rejection (ThreatModel T1–T3)
- [ ] 6.2 Integration test: changing size updates `:root` variables and re-paginates the Contents Key live (no reload)
- [ ] 6.3 E2E real-print (Chromium + Firefox via Mozilla Save to PDF), for Letter and A4 each: correct sheet size, one section per sheet, full-page border, symmetric margins, two-column Contents Key, no blank/overflow sheets — print **emulation alone is not sufficient**
- [ ] 6.4 E2E: proportional-parity check between Letter-on-Letter and A4-on-A4 renders
- [ ] 6.5 Regression: existing `printPageBreaks` / `printPdfPagination` specs stay green in both engines; full-bleed export verified
- [ ] 6.6 Walk each delta-spec scenario (`page-size-selection`, `scalable-page-layout`) and confirm coverage; run `npm run validate`; update the validate script if new build/test targets were added
