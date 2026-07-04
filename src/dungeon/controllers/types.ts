/* Shared context passed to the DOM/input controllers. Controllers read the
   current dungeon and the active edit mode, and mutate only through the editor. */
import type { Dungeon, MarkerType } from '../model/types';
import type { DungeonEditor } from '../api/dungeonEditor';

export type EditMode = 'room' | 'corridor' | 'delete' | null;

/** Shared, mutable holder for the active tools. A structure-editing mode and a
    selected legend marker type are mutually exclusive — activating one clears
    the other — so "what Enter does at the cursor" is always unambiguous. */
export interface ModeState { current: EditMode; selectedMarkerType: MarkerType | null; }

export interface ControllerContext {
  editor: DungeonEditor;
  getDungeon: () => Dungeon | null;
  modes: ModeState;
}
