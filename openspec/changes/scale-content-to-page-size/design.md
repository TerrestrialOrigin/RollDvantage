## Context

Every printable surface in the app is a `.page` fixed at `8.5in × 11in`, with a `.frame` positioned `inset:0.55in` inside it, maps sized to a fixed pixel width, and a Contents Key paginated by measuring that fixed frame's height. This works on screen and prints correctly in Chrome, which honours `@page { size; margin }`.

The `bug/FirefoxPrintParity` fix (now on `develop`) established what Firefox's print pipeline actually does — verified against **real** Firefox print output (Mozilla Save to PDF), not print emulation, which hides all of it:

- Firefox **ignores `@page { size }`** and prints the OS/printer default paper (A4 on the test machine).
- Firefox **will not stretch** any element to the sheet height — `height:100vh`, `height:100%`, and fixed `height:11in` all collapse to content height, so an absolutely-positioned full-page frame loses its border and margins.
- A page **wider than the physical paper** triggers Firefox's shrink-to-fit, which rescales and breaks the layout.
- Firefox collapses a `grid-template-columns:<fr>` grid to **one column** in print.

The shipped fix works *around* these (a `position:fixed` border overlay, flowed content, `break-after` + `.sheet-last`, a flex/fixed-column Contents Key). It makes both engines produce a correct framed document, but content **flows at a fixed size** rather than scaling — so Letter (Chrome) and A4 (Firefox) differ in proportion, and the fixed workarounds are load-bearing.

**Constraint that shapes this whole design:** the browser does not reliably expose the print page-box dimensions to CSS/JS at print time, and Firefox ignores the CSS page size. Therefore the app cannot *detect* the paper — it can only be *told* what paper to target.

## Goals / Non-Goals

**Goals:**
- All page geometry derives from a single source of truth (`--page-w` / `--page-h`), not hard-coded inches.
- The user can select a target page size (Letter, A4, Legal, custom W×H) via a paper icon in the screen chrome; it persists and drives the on-screen page and its contents.
- The page frame, maps, Contents Key, and cover scale/reflow proportionally to the selected size **on screen**.
- **Printed** output (frame/border, page breaks, margins) **auto-fits whatever paper the browser actually prints**, in both Chromium and Firefox, with **no requirement** that the on-screen selection match the print dialog.
- Print correctness is proven at ≥2 paper sizes against **real Firefox** output and Chromium.

**Non-Goals:**
- Auto-detecting the physical printer paper (browsers don't expose it; explicitly out of scope) — which is *why* print auto-fits rather than relying on a detected size.
- Guaranteeing that page **content** (map, text) *zooms to fill* the printed sheet edge-to-edge — that needs the sheet dimensions (unavailable to CSS/JS) and Firefox won't stretch content to the sheet height. It is a prototype-gated stretch (task 1), not a committed goal; the frame/breaks/margins auto-fit regardless.
- Non-portrait orientation and multi-up/booklet layouts (future work).
- Changing the full-bleed PDF export's trim/bleed model (`html.pdf-bleed`).

## Decisions

### D1. Single geometry source: CSS custom properties on `:root`
`--page-w` / `--page-h` already exist but are unused by layout. Make **every** page dimension reference them (page shell, frame insets as `calc()` off page size where proportional, `@page { size: var(--page-w) var(--page-h) }`, map/Contents Key sizing). A page-size change becomes a variable update.
- *Alternative considered:* a Sass/build-time constant — rejected; the size must change at runtime from user input, so it must be a CSS custom property, not a compile-time value.

### D2. Page size is user-selected for the on-screen view
A **paper icon in the top-right screen chrome** (in the margin, off the printable page) opens a popup offering presets (Letter / A4 / Legal) and a custom W×H. The selection sets the `:root` geometry variables — driving the on-screen page and its contents — and is persisted to `localStorage`. Default resolution order: persisted value → locale heuristic (`en-US`/`en-CA` → Letter, else A4) → Letter.
- *Rationale:* the app cannot read the physical print paper, so the selection is the source of truth for the **screen** (a true-proportion preview / working size). It is **not** required to match the print dialog — print auto-fits the real sheet independently (D4).
- *Placement:* top-right chrome icon + popup, not the bottom toolbar, so it is discoverable and stays off the page surface.
- *Alternative considered:* auto-detect the paper — impossible (no browser API); rejected.

### D3. Content scales because it is expressed relative to page size
Maps render into an SVG with a `viewBox`, sized `width:100%` within the frame, so they scale to whatever the frame resolves to. The Contents Key columns and box sizing are expressed relative to the frame width. The cover fields already use relative layout. Nothing in the content assumes 816px.
- *Alternative considered:* a global `transform: scale(pageScale)` on a reference-sized canvas — rejected for print (Firefox scaling/`transform` interactions in print are unreliable, and it fights pagination). Relative layout is robust in both engines.

### D4. Print auto-fits the real sheet — no dialog match required
The printed frame/border, page breaks, and margins auto-fit whatever paper the browser actually prints, independent of the on-screen selection: the `position:fixed` border overlay is resolved by the browser against the real print page box (proven to fill any paper in both engines), `break-after` puts each section on its own sheet at any size, and the margins follow the frame. The overlay is therefore the **primary** print-border mechanism — precisely *because* it needs no knowledge of the paper size.
- *Consequence:* the user never has to make the on-screen selection match the print dialog; print is correct on any paper. This removes the earlier "match your printer" hint from scope.
- *Keep one border:* only the overlay border prints (the in-flow `.frame` border is suppressed in normal print) to avoid a double frame.
- *Resolved by prototype (task 1):* content zoom-fill **is achievable**. A clean `height:100%` chain (`html → body → .page`) plus scalable content (SVG `viewBox` / relative units) fills 99%×99% of every sheet, paginated correctly (3/3), in real Firefox (A4) and Chromium (Letter + A4), with **no paper detection**. Firefox *does* stretch content to the sheet — the earlier failure was the old `display:contents`+absolute-frame nesting, not a Firefox limit. (`vh`/`min-vh` under-fill at ~91%; use the `%` chain, not viewport units.)
- *Consequence:* the print model shifts from "overlay works around non-filling content" to "content genuinely fills the sheet." The `position:fixed` overlay can likely be **retired** (not merely demoted to fallback), pending confirmation that the decorative border also fills via the same `height:100%` chain. This is the single biggest change vs. the shipped fix and should be validated early in implementation.

### D5. Contents Key pagination measures the *current* page geometry
`renderContentsKey` must reserve/measure against the resolved `--page-h` frame, not a constant, and re-run on page-size change (as it already re-runs on the small-screen breakpoint). Column layout stays `fr`-free in print (from the shipped fix) so Firefox keeps two columns.

### D6. Persistence mirrors existing settings
Store `{ pageSize: 'letter' | 'a4' | 'legal' | {w,h,unit} }` in `localStorage` under a namespaced key, loaded at boot before first render.

### Test Strategy
- **Unit:** page-size resolution (default order, locale heuristic), custom-size validation/clamping, variable emission.
- **Integration:** changing the size updates `:root` variables and re-paginates the Contents Key without reload.
- **E2E / print (the load-bearing layer):** for **each** of Letter and A4 selections, render **real** print output in **Chromium and Firefox** (Firefox via Mozilla Save to PDF), asserting: correct sheet size, one section per sheet, full-page border present, symmetric margins, two-column Contents Key, and proportional parity between a Letter-on-Letter and A4-on-A4 render. Reuse the harness proven in the bug fix. Print **emulation alone is not acceptable** — it hides every Firefox print behavior above.

### User Error Scenarios
- Custom size with empty / non-numeric / zero / negative dimensions → reject, keep previous valid size, inline validation message.
- Absurd custom size (e.g. 0.1in or 500in) → clamp to sane bounds (e.g. 3–48in) with feedback.
- Unit confusion (in vs mm) → explicit unit selector; store canonical units.
- On-screen selection differs from the print-dialog paper → **expected and handled**: the on-screen size and the print paper are independent, and print auto-fits the dialog paper (D4), so no user action or "match your printer" step is needed.
- Rapid repeated toggling → debounce re-pagination; last selection wins; no orphaned Contents Key pages.
- Corrupt/legacy `localStorage` value → fall back to default resolution, never crash.

### Security Analysis
Front-end only; no new network calls, no server, no secrets. Primary surface is the custom-size input and the persisted value. Threats and mitigations are recorded in `ThreatModel.md` (input validation/clamping, no `eval`/`innerHTML` of user values into layout, safe `localStorage` parse). No GDPR/PII impact (page size is not personal data). No `@page`/CSS-variable injection: numeric inputs are validated and interpolated as typed numbers with fixed units, never as raw strings into CSS.

## Risks / Trade-offs

- **[Firefox still won't fill the sheet height even at exact paper match]** → keep the `position:fixed` overlay as the border/fill mechanism; prototype task D4 decides primary vs fallback before broad implementation.
- **[User selects the wrong paper size]** → cannot be fully prevented (undetectable); mitigate with a good default (locale), persistence, an in-UI hint, and the overlay fallback so output is never broken, only slightly off-size.
- **[Contents Key pagination drift across sizes/engines]** → measure against live geometry, re-run on change, keep conservative reserve, and cover with real-print e2e at each size.
- **[Regressing the shipped cross-browser fix]** → the existing print e2e specs stay green throughout; the change is additive (geometry variables) before any workaround is removed.
- **[Scope creep into orientation/booklet]** → explicitly a non-goal; custom W×H already covers landscape by swapping numbers if a user needs it.

## Migration Plan

1. Introduce `--page-w/--page-h` as the geometry source with the **current** Letter values (no behavior change), and refactor hard-coded dimensions to reference them. Ship/verify parity.
2. Add page-size selection + persistence, defaulting to Letter (still no change for existing users).
3. Make maps / Contents Key / frame size-relative; verify real-print output at Letter and A4.
4. Decide overlay primary-vs-fallback from the prototype; simplify workarounds only where real-print tests stay green.
- **Rollback:** each step is independently revertible; the default resolves to Letter, reproducing today's behavior, so a rollback is a settings/default flip, not a data migration.

## Open Questions

- ~~Can page content zoom-fill the printed sheet in real Firefox without knowing the paper size?~~ **Resolved (task 1): yes**, via a `height:100%` chain + scalable content.
- Does the decorative **border** also fill the sheet via the same `height:100%` chain (letting us retire the `position:fixed` overlay entirely)? Validate early in implementation (task group 4/5).
- Restructuring risk: replacing `.page-wrap { display:contents }` + absolute `.frame` with the `height:100%` chain must not regress the on-screen scaling or the shipped print e2e — do it behind the existing green tests.
- Default heuristic: locale-based, or always Letter with a first-run prompt?
- Should custom sizes support `mm`/`cm` as well as `in` at launch, or inches only first?
- Is a Firefox print-to-PDF harness acceptable in CI (headless Mozilla Save to PDF), or does it run as a local/manual gate?
