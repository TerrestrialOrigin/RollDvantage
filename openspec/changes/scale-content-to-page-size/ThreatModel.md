# Threat Model — scale-content-to-page-size

Scope: a front-end-only feature. No server, no network calls, no authentication, no secrets, no PII. Attack surface is small: a page-size selection (presets + custom numeric W×H), a value persisted in `localStorage`, and the derived CSS custom properties / `@page` size that feed layout.

Assets: the integrity of the rendered/printed layout, and the app not crashing on bad state. Page size is not personal data (no GDPR impact).

| # | Threat | Vector | Impact | Likelihood | Mitigation |
|---|--------|--------|--------|-----------|------------|
| T1 | CSS injection via custom size | User (or tampered `localStorage`) supplies a non-numeric string that gets interpolated into a CSS var / `@page size` (e.g. `10in; } body { display:none } @page{`) | Layout hijack / content hiding | Low | Parse custom dimensions as **numbers**, reject non-numeric; interpolate only `number + fixed-unit`, never raw strings; never build CSS from concatenated user text |
| T2 | Denial-of-render via absurd size | Custom size of `0`, negative, `NaN`, or e.g. `9999in` | Blank/broken output, huge layout, pagination blowup | Low | Validate + **clamp** to sane bounds (e.g. 3–48in); reject 0/negative/NaN; keep previous valid size on rejection |
| T3 | Corrupt/hostile persisted value | Malformed or legacy JSON in `localStorage` | Crash on boot / undefined behavior | Low | Defensive parse in try/catch; unknown/invalid → fall back to default resolution; never throw during load |
| T4 | XSS through the value elsewhere | Persisted size echoed into the DOM as HTML (e.g. a label) | Script execution | Very low | Render size labels as text nodes / from a fixed preset table; never `innerHTML` user input |
| T5 | Cross-origin/`localStorage` tampering | Another script on the origin writes the key | Layout tampering only (no privilege) | Low | Same-origin trust boundary already assumed; T1–T3 validation makes the value safe regardless of source |
| T6 | Print-CSS abuse | User-controlled value reaches `@page`/print rules | Broken print, wasted paper | Low | Same numeric validation (T1/T2); print output is user-local, no external impact |

Residual risk: low. All identified vectors reduce to "validate the numeric custom size and defensively parse the persisted value," which the design (D2, D6) and the delta spec's validation scenarios require. No dual-use or external-facing risk.
