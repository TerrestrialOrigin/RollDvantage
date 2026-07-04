## Why

The app hard-codes US-Letter (8.5×11in) page geometry, but browsers print to whatever paper the OS/printer is set to — and Firefox ignores CSS `@page { size }` entirely, printing the OS default (e.g. A4) while refusing to stretch elements to the sheet. The shipped bug fix (`bug/FirefoxPrintParity`) made print *paper-agnostic* with workarounds, but the content still doesn't *scale* to the sheet: Letter (Chrome) and A4 (Firefox) come out in different proportions, and a couple of decorative elements don't render in Firefox at all. Anyone printing on non-Letter paper gets inconsistent, off-size output.

## What Changes

- Add a **user-selectable page size** (presets: Letter, A4, Legal; plus custom width×height) with a sensible default, surfaced in the toolbar.
- Drive **all** page geometry from CSS variables (`--page-w` / `--page-h`) set from the selection, replacing every hard-coded `8.5in` / `11in`.
- Make the page frame, maps (SVG), Contents Key, and cover **scale/reflow to the selected dimensions** on screen and in print, so the output looks proportionally identical at any page size.
- Emit `@page { size: <selected> }` so Chrome prints 1:1; **document that the selected size should match the physical printer paper** so Firefox (which ignores `@page size`) also fills the sheet 1:1.
- **Persist** the selected page size in `localStorage`, consistent with existing app settings.
- Where the scaled model makes them unnecessary, **retire the paper-specific print workarounds**; keep the `position:fixed` border overlay only as a fallback for paper mismatch. **BREAKING** for the internal print CSS contract (no user-facing breakage).
- Verify print correctness at multiple page sizes against **real Firefox print output** (Mozilla Save to PDF) in addition to Chromium.

## Capabilities

### New Capabilities

- `page-size-selection`: choosing, defaulting, validating, and persisting the target page size (presets + custom dimensions), and exposing it to the layout as CSS variables.
- `scalable-page-layout`: page shell, decorative frame, map rendering, and Contents Key pagination derive their geometry from the selected page size so content scales to fit any page dimensions, on screen and when printed, in both Chromium and Firefox.

### Modified Capabilities

_None — `openspec/specs/` is currently empty; there are no existing capability specs to modify._

## Impact

- **CSS / layout:** `src/styles/chronicle.css` (page shell, `.frame`, `@page`, print rules), `index.html` (page markup, Contents Key grid, new toolbar control).
- **Scaling / geometry:** `src/chronicle/pageScaling.ts` (currently assumes an 8.5in natural width).
- **Maps:** `src/dungeon/rendering/*` (SVG sizing/viewBox).
- **Contents Key:** `src/dungeon/contentsKey/contentsKeyView.ts` (pagination measures a fixed frame height).
- **Settings/persistence:** page-size setting stored/loaded like other preferences.
- **Tests:** print e2e (`e2e/printPageBreaks.spec.ts`, `e2e/printPdfPagination.spec.ts`) extended to multiple page sizes and **real Firefox** print output; unit tests for size resolution/validation.
- **No back-end/API changes**; no new runtime dependencies.
