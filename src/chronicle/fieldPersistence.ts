/* Field persistence — any [data-key] element (input or contenteditable) is
   saved to localStorage and restored on load, namespaced by the store prefix.
   Logic preserved verbatim. */

export interface FieldPersistence { clearAll: () => void; }

export function setupFieldPersistence(storePrefix: string): FieldPersistence {
  const fields = document.querySelectorAll<HTMLElement>('[data-key]');
  fields.forEach((element) => {
    const key = storePrefix + element.dataset.key;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      if (element.tagName === 'INPUT') { (element as HTMLInputElement).value = saved; }
      else { element.innerHTML = saved; }
    }
    element.addEventListener('input', () => {
      localStorage.setItem(key, element.tagName === 'INPUT' ? (element as HTMLInputElement).value : element.innerHTML);
    });
  });

  return {
    clearAll: () => {
      fields.forEach((element) => {
        localStorage.removeItem(storePrefix + element.dataset.key);
        if (element.tagName === 'INPUT') { (element as HTMLInputElement).value = ''; } else { element.innerHTML = ''; }
      });
    },
  };
}
