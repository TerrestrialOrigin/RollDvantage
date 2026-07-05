/* Shared responsive-layout breakpoints (M13). CSS media queries cannot read
   TS constants, so the stylesheets carry annotated copies — every `@media
   (max-width:700px)` in dungeon.css / chronicle.css must match this value. */

/** Below this width the chronicle reflows to the narrow single-column layout
    (no page scaling; the Contents Key skips pagination). */
export const NARROW_LAYOUT_QUERY = '(max-width:700px)';
