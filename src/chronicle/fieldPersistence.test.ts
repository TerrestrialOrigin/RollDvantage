import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupFieldPersistence } from './fieldPersistence';

const PREFIX = 'test_';

function renderFields(): { input: HTMLInputElement; note: HTMLElement } {
  document.body.innerHTML =
    '<input data-key="title">' +
    '<div data-key="note" contenteditable="true"></div>';
  return {
    input: document.querySelector('input[data-key="title"]')!,
    note: document.querySelector('div[data-key="note"]')!,
  };
}

function typeInto(element: HTMLElement, text: string): void {
  if (element instanceof HTMLInputElement) element.value = text;
  else element.textContent = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('field persistence (save / restore / clear)', () => {
  it('saves typed values under namespaced keys, restores on re-init, and clearAll wipes both', () => {
    const first = renderFields();
    setupFieldPersistence(PREFIX);
    typeInto(first.input, 'Sir Reginald');
    typeInto(first.note, 'slain by a mimic');
    expect(localStorage.getItem('test_title')).toBe('Sir Reginald');
    expect(localStorage.getItem('test_note')).toBe('slain by a mimic');

    // fresh DOM (page reload) — values restore from storage
    const second = renderFields();
    const persistence = setupFieldPersistence(PREFIX);
    expect(second.input.value).toBe('Sir Reginald');
    expect(second.note.textContent).toBe('slain by a mimic');

    persistence.clearAll();
    expect(localStorage.getItem('test_title')).toBeNull();
    expect(localStorage.getItem('test_note')).toBeNull();
    expect(second.input.value).toBe('');
    expect(second.note.textContent).toBe('');
  });
});

describe('field persistence robustness (M10)', () => {
  it('keeps accepting input when storage writes throw (quota / private mode)', () => {
    const fields = renderFields();
    setupFieldPersistence(PREFIX);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => typeInto(fields.input, 'still typing')).not.toThrow();
    expect(fields.input.value).toBe('still typing');
  });

  it('sets up cleanly when storage reads throw', () => {
    renderFields();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(() => setupFieldPersistence(PREFIX)).not.toThrow();
  });

  it('restores previously stored markup inert as text, never as live HTML', () => {
    localStorage.setItem('test_note', '<img src=x onerror="document.title=\'pwned\'">');
    const fields = renderFields();
    setupFieldPersistence(PREFIX);
    expect(fields.note.querySelector('img')).toBeNull();
    expect(fields.note.textContent).toContain('<img');
  });

  it('persists plain text, not markup, from contenteditable fields', () => {
    const fields = renderFields();
    setupFieldPersistence(PREFIX);
    fields.note.innerHTML = 'hello <b>bold</b>';
    fields.note.dispatchEvent(new Event('input', { bubbles: true }));
    expect(localStorage.getItem('test_note')).toBe('hello bold');
  });
});
