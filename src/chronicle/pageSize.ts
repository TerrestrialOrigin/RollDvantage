/* ============================================================
   Page size — the single source of truth for page geometry.

   Resolves the target page size (persisted → locale → Letter), validates custom
   dimensions, and applies the result to `--page-w` / `--page-h` on :root, from
   which all layout and `@page { size }` derive. Pure logic here; the DOM control
   lives in pageSizeControl.ts.
   ============================================================ */

export type Unit = 'in' | 'mm';
export interface PageSize { width: number; height: number; unit: Unit; }

/** Common presets. Persisted sizes use the compact legacy `{w,h,unit}` shape —
    see loadPersisted/savePersisted, the only places that shape exists. */
export const PRESETS: Record<string, PageSize> = {
  letter: { width: 8.5, height: 11, unit: 'in' },
  a4: { width: 210, height: 297, unit: 'mm' },
  legal: { width: 8.5, height: 14, unit: 'in' },
};

const MIN_INCHES = 3;
const MAX_INCHES = 48;
const MM_PER_INCH = 25.4;

function toInches(value: number, unit: Unit): number {
  return unit === 'mm' ? value / MM_PER_INCH : value;
}
function fromInches(inches: number, unit: Unit): number {
  return unit === 'mm' ? inches * MM_PER_INCH : inches;
}

/**
 * Validate a single dimension. Rejects non-numeric / zero / negative / NaN,
 * clamps to [MIN_INCHES, MAX_INCHES]. Returns the accepted value in `unit`, or
 * null if the input is not a usable number (guards CSS injection: only real
 * numbers ever reach the CSS variables).
 */
export function validateDimension(value: unknown, unit: Unit): number | null {
  // Number() (not parseFloat) so trailing garbage like "10in; }" is rejected
  // outright rather than silently parsed to 10 — defense in depth for ThreatModel T1.
  const asNumber = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
  const clampedInches = Math.min(MAX_INCHES, Math.max(MIN_INCHES, toInches(asNumber, unit)));
  return Number(fromInches(clampedInches, unit).toFixed(3));
}

/** Validate a full custom size; null if either dimension is unusable. */
export function validateCustom(width: unknown, height: unknown, unit: Unit): PageSize | null {
  const validWidth = validateDimension(width, unit);
  const validHeight = validateDimension(height, unit);
  if (validWidth === null || validHeight === null) return null;
  return { width: validWidth, height: validHeight, unit };
}

/** Letter for US/Canada locales, A4 otherwise. */
export function defaultForLocale(locale: string): PageSize {
  return /^en-(us|ca)\b/i.test(locale) ? PRESETS.letter : PRESETS.a4;
}

function storageKey(prefix: string): string { return prefix + 'pageSize'; }

/** Read a persisted size, defensively — corrupt/invalid values yield null.
    The stored payload keeps the legacy compact `{w,h,unit}` keys so sizes
    saved before the width/height rename still restore. */
export function loadPersisted(prefix: string): PageSize | null {
  try {
    const raw = localStorage.getItem(storageKey(prefix));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { w?: unknown; h?: unknown; unit?: unknown };
    if (typeof parsed !== 'object' || parsed === null) return null;
    const unit: Unit = parsed.unit === 'mm' ? 'mm' : 'in';
    return validateCustom(parsed.w, parsed.h, unit);
  } catch {
    return null;
  }
}

export function savePersisted(prefix: string, size: PageSize): void {
  const stored = { w: size.width, h: size.height, unit: size.unit };   // legacy storage shape, byte-compatible
  try { localStorage.setItem(storageKey(prefix), JSON.stringify(stored)); } catch { /* storage unavailable */ }
}

/** Resolution order: persisted → locale heuristic → Letter. */
export function resolveInitial(prefix: string, locale: string): PageSize {
  return loadPersisted(prefix) ?? defaultForLocale(locale) ?? PRESETS.letter;
}

/** Write the size to the CSS variables that drive all geometry + `@page`. */
export function applyPageSize(size: PageSize): void {
  const root = document.documentElement;
  root.style.setProperty('--page-w', `${size.width}${size.unit}`);
  root.style.setProperty('--page-h', `${size.height}${size.unit}`);
}

export interface PageSizeController {
  get(): PageSize;
  set(size: PageSize): void;
  subscribe(listener: (size: PageSize) => void): void;
}

/** Resolve + apply the initial size immediately, and expose live changes. */
export function setupPageSize(prefix: string, locale: string = navigator.language || 'en-US'): PageSizeController {
  let current = resolveInitial(prefix, locale);
  const listeners: ((size: PageSize) => void)[] = [];
  applyPageSize(current);
  return {
    get: () => current,
    set(size: PageSize) {
      current = size;
      applyPageSize(size);
      savePersisted(prefix, size);
      listeners.forEach((listener) => listener(size));
    },
    subscribe(listener) { listeners.push(listener); },
  };
}
