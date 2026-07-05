/* ============================================================
   Context-menu controller — the right-click cell menu (delete / retype / add /
   make-secret). Right-click is kept behind this seam so a touch long-press
   alternative can be added later without touching the editor. All actions go
   through the DungeonEditor; the popup lifecycle (position/dismiss/focus)
   lives in the shared floatingMenu helper. Logic preserved verbatim.
   ============================================================ */
import type { MarkerType } from '../model/types';
import { featureAt, featureBBox } from '../editing/featureQueries';
import { openFloatingMenu, type FloatingMenuSession } from './floatingMenu';
import { createListenerBag } from './listenerBag';
import type { ControllerContext } from './types';

interface MenuItem { label: string; danger?: boolean; check?: boolean; sep?: boolean; act: (() => void) | null; }

const MARKER_TYPES: [MarkerType, string][] = [
  ['monster', 'Monster'], ['boss', 'Boss'], ['treasure', 'Treasure'], ['trap', 'Trap'], ['entrance', 'Entrance'], ['exit', 'Exit'], ['other', 'Other'],
];

export interface ContextMenuHandles {
  openContextMenu: (gridX: number, gridY: number, clientX: number, clientY: number) => void;
  /** Close any open menu and remove the controller's window listeners. */
  detach: () => void;
}

export function attachContextMenuController(context: ControllerContext): ContextMenuHandles {
  const { editor, getDungeon } = context;
  const bag = createListenerBag();
  let session: FloatingMenuSession | null = null;

  function closeCellMenu(): void { session?.close(); }

  function openContextMenu(gridX: number, gridY: number, clientX: number, clientY: number): void {
    closeCellMenu();
    const dungeon = getDungeon(); if (!dungeon) return;
    const feature = featureAt(dungeon, gridX, gridY); if (!feature) return;
    const items: MenuItem[] = [];
    if (feature.kind === 'marker') {
      const markerIndex = feature.index!;
      items.push({ label: 'Delete', danger: true, act: () => { editor.deleteMarker(markerIndex); } });
      MARKER_TYPES.forEach((entry, index) => {
        const isCurrent = entry[0] === feature.marker!.type;
        items.push({ label: entry[1], check: isCurrent, sep: index === 0, act: isCurrent ? null : () => { editor.retypeMarker(markerIndex, entry[0]); } });
      });
    } else {
      const bbox = featureBBox(dungeon, feature, gridX, gridY);
      items.push({ label: 'Delete', danger: true, act: () => { editor.deleteRegion(bbox.minX, bbox.minY, bbox.maxX, bbox.maxY); } });
      if (feature.kind === 'room' || feature.kind === 'corridor') items.push({ label: 'Make Secret', act: () => { editor.makeSecret(gridX, gridY); } });
      else items.push({ label: 'Make Not Secret', act: () => { editor.unmakeSecret(gridX, gridY); } });
      MARKER_TYPES.forEach((entry, index) => {
        items.push({ label: entry[1] + ' (add)', sep: index === 0, act: () => { editor.addMarker(entry[0], gridX, gridY); } });
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
    session = openFloatingMenu({
      menu,
      position: { kind: 'point', clientX, clientY },
      onClose: () => { session = null; },
    });
  }

  bag.listen<KeyboardEvent>(window, 'keydown', (event) => { if (event.key === 'Escape') closeCellMenu(); });

  return {
    openContextMenu,
    detach() { closeCellMenu(); bag.detach(); },
  };
}
