/* Composition root for the chronicle behaviour: page scaling + field
   persistence + the optional toolbar. `store` namespaces the persisted keys. */
import { setupPageScaling } from './pageScaling';
import { setupFieldPersistence } from './fieldPersistence';
import { setupChronicleToolbar } from './chronicleToolbar';

export function initChronicle(store?: string): void {
  const storePrefix = store ?? 'chronicle_';
  setupPageScaling();
  const { clearAll } = setupFieldPersistence(storePrefix);
  setupChronicleToolbar(clearAll);
}
