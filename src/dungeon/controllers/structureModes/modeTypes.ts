/* Shared shape of the per-mode interaction modules that make up the structure
   controller (M12 split). Each module wires its own listeners on attach and
   hands the orchestrator a reset (mode switch) + detach (teardown) handle. */
import type { ControllerContext } from '../types';

export interface StructureModeModuleDeps extends ControllerContext {
  /** The #dm-map wrapper the map listeners attach to. */
  dmWrap: HTMLElement;
}

export interface StructureModeModule {
  /** Abandon any in-progress interaction state (called on every mode switch;
      the orchestrator clears the shared preview afterwards). */
  reset(): void;
  /** Remove every listener this module registered. */
  detach(): void;
}
