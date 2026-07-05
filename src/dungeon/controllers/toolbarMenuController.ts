/* Small-screen toolbar: collapse into a hamburger that expands vertically.
   Ported from the former inline <script> at the bottom of index.html; this
   controller owns the responsive open/close chrome of #toolbar, while
   toolbarController.ts owns the editor actions inside it. */

/** Must match the CSS `@media (max-width:760px)` toolbar breakpoints in
    src/styles/dungeon.css — above this width the collapsed menu resets. */
export const TOOLBAR_COLLAPSE_MAX_PX = 760;

export interface ToolbarMenuHandle { detach(): void; }

export function attachToolbarMenuController(): ToolbarMenuHandle {
  const noopHandle: ToolbarMenuHandle = { detach: () => undefined };
  const toolbar = document.getElementById('toolbar');
  const toggle = document.getElementById('tb-toggle');
  if (!toolbar || !toggle) return noopHandle;
  const items = toolbar.querySelector('.tb-items');

  function setOpen(open: boolean): void {
    if (!toolbar || !toggle) return;
    toolbar.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  const onToggleClick = (): void => { setOpen(!toolbar.classList.contains('open')); };

  const onItemsClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button) return;
    if (button.closest('.lvl')) return;          // +/- complexity dial: keep menu open
    if (button.closest('.tb-undoredo')) return;  // undo/redo: keep menu open for repeats
    if (button.id === 'btn-new') return;         // Generate opens its own submenu
    setOpen(false);                              // any other action closes the menu
  };

  const onWindowResize = (): void => {
    if (window.innerWidth > TOOLBAR_COLLAPSE_MAX_PX) setOpen(false);
  };

  toggle.addEventListener('click', onToggleClick);
  items?.addEventListener('click', onItemsClick);
  window.addEventListener('resize', onWindowResize);

  return {
    detach() {
      toggle.removeEventListener('click', onToggleClick);
      items?.removeEventListener('click', onItemsClick);
      window.removeEventListener('resize', onWindowResize);
    },
  };
}
