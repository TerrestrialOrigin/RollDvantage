/* Composition root for the chronicle behaviour: page scaling + field
   persistence + the optional toolbar. `store` namespaces the persisted keys. */
import { setupPageScaling } from './pageScaling';
import { setupFieldPersistence } from './fieldPersistence';
import { setupChronicleToolbar } from './chronicleToolbar';
import { setupPageSizeControl } from './pageSizeControl';
import type { PageSizeController } from './pageSize';

export function initChronicle(store?: string, pageSize?: PageSizeController): void {
  const storePrefix = store ?? 'chronicle_';
  setupPageScaling();
  if (pageSize) setupPageSizeControl(pageSize);
  const { clearAll } = setupFieldPersistence(storePrefix);
  setupChronicleToolbar(clearAll);
}
