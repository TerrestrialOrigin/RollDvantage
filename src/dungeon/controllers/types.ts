/* Shared context passed to the DOM/input controllers. Controllers read the
   current dungeon and the active edit mode, and mutate only through the editor. */
import type { Dungeon } from '../model/types';
import type { DungeonEditor } from '../api/dungeonEditor';

export type EditMode = 'room' | 'corridor' | 'delete' | null;

/** Shared, mutable holder for the active structure-editing mode. */
export interface ModeState { current: EditMode; }

export interface ControllerContext {
  editor: DungeonEditor;
  getDungeon: () => Dungeon | null;
  modes: ModeState;
}
