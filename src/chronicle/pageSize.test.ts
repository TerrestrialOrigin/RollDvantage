import { describe, it, expect, beforeEach } from 'vitest';
import {
  PRESETS,
  validateDimension,
  validateCustom,
  defaultForLocale,
  loadPersisted,
  savePersisted,
  resolveInitial,
  applyPageSize,
  setupPageSize,
} from './pageSize';

const PREFIX = 'test_';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty('--page-w');
  document.documentElement.style.removeProperty('--page-h');
});

describe('validateDimension', () => {
  it('accepts a plain positive number', () => {
    expect(validateDimension(7, 'in')).toBe(7);
  });
  it('parses numeric strings', () => {
    expect(validateDimension('8.5', 'in')).toBe(8.5);
  });
  it('rejects zero, negative, NaN, and non-numeric', () => {
    expect(validateDimension(0, 'in')).toBeNull();
    expect(validateDimension(-4, 'in')).toBeNull();
    expect(validateDimension(NaN, 'in')).toBeNull();
    expect(validateDimension('abc', 'in')).toBeNull();
    expect(validateDimension('10in; } body{display:none}', 'in')).toBeNull();
  });
  it('clamps below the minimum and above the maximum (inches)', () => {
    expect(validateDimension(0.1, 'in')).toBe(3);
    expect(validateDimension(500, 'in')).toBe(48);
  });
  it('clamps in millimetres using the inch bounds', () => {
    // 1000mm ≈ 39.4in (within 3–48) → unchanged; 5000mm → clamps to 48in = 1219.2mm
    expect(validateDimension(1000, 'mm')).toBe(1000);
    expect(validateDimension(5000, 'mm')).toBe(1219.2);
  });
});

describe('validateCustom', () => {
  it('returns a size when both dimensions are valid', () => {
    expect(validateCustom(7, 9, 'in')).toEqual({ width: 7, height: 9, unit: 'in' });
  });
  it('returns null when either dimension is invalid', () => {
    expect(validateCustom(0, 9, 'in')).toBeNull();
    expect(validateCustom(7, 'x', 'in')).toBeNull();
  });
});

describe('defaultForLocale', () => {
  it('is Letter for US/Canada English', () => {
    expect(defaultForLocale('en-US')).toBe(PRESETS.letter);
    expect(defaultForLocale('en-CA')).toBe(PRESETS.letter);
  });
  it('is A4 elsewhere', () => {
    expect(defaultForLocale('de-DE')).toBe(PRESETS.a4);
    expect(defaultForLocale('en-GB')).toBe(PRESETS.a4);
  });
});

describe('persistence', () => {
  it('round-trips a saved size', () => {
    savePersisted(PREFIX, { width: 210, height: 297, unit: 'mm' });
    expect(loadPersisted(PREFIX)).toEqual({ width: 210, height: 297, unit: 'mm' });
  });
  it('restores a payload stored before the width/height rename (legacy {w,h,unit} keys)', () => {
    localStorage.setItem(PREFIX + 'pageSize', JSON.stringify({ w: 8.5, h: 14, unit: 'in' }));
    expect(loadPersisted(PREFIX)).toEqual({ width: 8.5, height: 14, unit: 'in' });
  });
  it('writes the current full-name storage shape ({width,height,unit})', () => {
    savePersisted(PREFIX, { width: 8.5, height: 11, unit: 'in' });
    expect(JSON.parse(localStorage.getItem(PREFIX + 'pageSize')!)).toEqual({ width: 8.5, height: 11, unit: 'in' });
  });
  it('returns null for a missing value', () => {
    expect(loadPersisted(PREFIX)).toBeNull();
  });
  it('returns null (never throws) for corrupt or invalid persisted data', () => {
    localStorage.setItem(PREFIX + 'pageSize', '{not json');
    expect(loadPersisted(PREFIX)).toBeNull();
    localStorage.setItem(PREFIX + 'pageSize', JSON.stringify({ w: 0, h: -1, unit: 'in' }));
    expect(loadPersisted(PREFIX)).toBeNull();
    localStorage.setItem(PREFIX + 'pageSize', JSON.stringify({ w: 'evil; }', h: 9, unit: 'in' }));
    expect(loadPersisted(PREFIX)).toBeNull();
  });
});

describe('resolveInitial', () => {
  it('prefers a persisted value over locale', () => {
    savePersisted(PREFIX, PRESETS.legal);
    expect(resolveInitial(PREFIX, 'de-DE')).toEqual(PRESETS.legal);
  });
  it('falls back to the locale default when nothing is persisted', () => {
    expect(resolveInitial(PREFIX, 'de-DE')).toEqual(PRESETS.a4);
    expect(resolveInitial(PREFIX, 'en-US')).toEqual(PRESETS.letter);
  });
});

describe('applyPageSize', () => {
  it('writes validated numbers + fixed unit to the CSS variables', () => {
    applyPageSize({ width: 210, height: 297, unit: 'mm' });
    expect(document.documentElement.style.getPropertyValue('--page-w')).toBe('210mm');
    expect(document.documentElement.style.getPropertyValue('--page-h')).toBe('297mm');
  });
});

describe('setupPageSize', () => {
  it('applies the resolved size on setup and notifies subscribers on change', () => {
    savePersisted(PREFIX, PRESETS.a4);
    const controller = setupPageSize(PREFIX, 'en-US');
    expect(controller.get()).toEqual(PRESETS.a4); // persisted wins over en-US
    expect(document.documentElement.style.getPropertyValue('--page-w')).toBe('210mm');

    let notified: unknown = null;
    controller.subscribe((size) => { notified = size; });
    controller.set(PRESETS.letter);
    expect(notified).toEqual(PRESETS.letter);
    expect(controller.get()).toEqual(PRESETS.letter);
    expect(document.documentElement.style.getPropertyValue('--page-w')).toBe('8.5in');
    expect(loadPersisted(PREFIX)).toEqual(PRESETS.letter);
  });
});
