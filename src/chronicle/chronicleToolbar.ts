/* Optional chronicle toolbar — #btn-print and #btn-clear (clear requires
   confirmation). Logic preserved verbatim. */

export function setupChronicleToolbar(clearAll: () => void): void {
  const print = document.getElementById('btn-print');
  if (print) print.addEventListener('click', () => { window.print(); });

  const clear = document.getElementById('btn-clear');
  if (clear) clear.addEventListener('click', () => {
    if (!confirm('Erase every answer you have typed? This cannot be undone.')) return;
    clearAll();
  });
}
