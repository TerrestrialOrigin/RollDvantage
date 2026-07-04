/* Field persistence — any [data-key] element (input or contenteditable) is
   saved to localStorage and restored on load, namespaced by the store prefix.

   Hardened boundary: storage access never throws into input handling (quota /
   private mode degrade persistence silently, mirroring pageSize.ts), and
   contenteditable values round-trip as plain text (textContent) — stored
   markup is restored inert, never parsed as HTML. */

export interface FieldPersistence { clearAll: () => void; }

function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable — keep typing working */ }
}

function removeStored(key: string): void {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

function readFieldValue(element: HTMLElement): string {
  return element.tagName === 'INPUT' ? (element as HTMLInputElement).value : (element.textContent ?? '');
}

function writeFieldValue(element: HTMLElement, value: string): void {
  if (element.tagName === 'INPUT') { (element as HTMLInputElement).value = value; }
  else { element.textContent = value; } // never innerHTML: stored markup stays inert text
}

export function setupFieldPersistence(storePrefix: string): FieldPersistence {
  const fields = document.querySelectorAll<HTMLElement>('[data-key]');
  fields.forEach((element) => {
    const key = storePrefix + element.dataset.key;
    const saved = readStored(key);
    if (saved !== null) writeFieldValue(element, saved);
    element.addEventListener('input', () => { writeStored(key, readFieldValue(element)); });
  });

  return {
    clearAll: () => {
      fields.forEach((element) => {
        removeStored(storePrefix + element.dataset.key);
        writeFieldValue(element, '');
      });
    },
  };
}
