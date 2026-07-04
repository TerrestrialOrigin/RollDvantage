/* ============================================================
   Context-menu controller — the right-click cell menu (delete / retype / add /
   make-secret). Right-click is kept behind this seam so a touch long-press
   alternative can be added later without touching the editor. All actions go
   through the DungeonEditor. Logic preserved verbatim from the original.
   ============================================================ */
import type { MarkerType } from '../model/types';
import { featureAt, featureBBox } from '../editing/featureQueries';
import type { ControllerContext } from './types';

interface MenuItem { label: string; danger?: boolean; check?: boolean; sep?: boolean; act: (() => void) | null; }

const MARKER_TYPES: [MarkerType, string][] = [
  ['monster', 'Monster'], ['boss', 'Boss'], ['treasure', 'Treasure'], ['trap', 'Trap'], ['entrance', 'Entrance'], ['exit', 'Exit'], ['other', 'Other'],
];

export function attachContextMenuController(context: ControllerContext): { openContextMenu: (gx: number, gy: number, clientX: number, clientY: number) => void } {
  const { editor, getDungeon } = context;
  let cellMenu: HTMLElement | null = null;

  function closeCellMenu(): void {
    if (cellMenu) { cellMenu.remove(); cellMenu = null; document.removeEventListener('pointerdown', menuOutside, true); }
  }
  function menuOutside(event: PointerEvent): void { if (cellMenu && !cellMenu.contains(event.target as Node)) closeCellMenu(); }

  function openContextMenu(gx: number, gy: number, clientX: number, clientY: number): void {
    closeCellMenu();
    const dungeon = getDungeon(); if (!dungeon) return;
    const feature = featureAt(dungeon, gx, gy); if (!feature) return;
    const items: MenuItem[] = [];
    if (feature.kind === 'marker') {
      const markerIndex = feature.idx!;
      items.push({ label: 'Delete', danger: true, act: () => { editor.deleteMarker(markerIndex); } });
      MARKER_TYPES.forEach((entry, index) => {
        const isCurrent = entry[0] === feature.marker!.type;
        items.push({ label: entry[1], check: isCurrent, sep: index === 0, act: isCurrent ? null : () => { editor.retypeMarker(markerIndex, entry[0]); } });
      });
    } else {
      const bbox = featureBBox(dungeon, feature, gx, gy);
      items.push({ label: 'Delete', danger: true, act: () => { editor.deleteRegion(bbox.ax, bbox.ay, bbox.bx, bbox.by); } });
      if (feature.kind === 'room' || feature.kind === 'corridor') items.push({ label: 'Make Secret', act: () => { editor.makeSecret(gx, gy); } });
      else items.push({ label: 'Make Not Secret', act: () => { editor.unmakeSecret(gx, gy); } });
      MARKER_TYPES.forEach((entry, index) => {
        items.push({ label: entry[1] + ' (add)', sep: index === 0, act: () => { editor.addMarker(entry[0], gx, gy); } });
      });
    }

    const menu = document.createElement('div'); menu.className = 'cell-menu';
    items.forEach((item) => {
      const button = document.createElement('button');
      const classes: string[] = []; if (item.danger) classes.push('danger'); if (item.sep) classes.push('sep'); if (item.check) classes.push('checked');
      if (classes.length) button.className = classes.join(' ');
      button.innerHTML = '<span class="ck">' + (item.check ? '&#10003;' : '') + '</span>' + item.label;
      button.addEventListener('click', () => { closeCellMenu(); if (item.act) item.act(); });
      menu.appendChild(button);
    });
    document.body.appendChild(menu); cellMenu = menu;
    const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
    menu.style.left = Math.max(8, Math.min(clientX, viewportWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(clientY, viewportHeight - menu.offsetHeight - 8)) + 'px';
    setTimeout(() => { document.addEventListener('pointerdown', menuOutside, true); }, 0);
  }

  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCellMenu(); });

  return { openContextMenu };
}
