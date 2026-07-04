import './styles/chronicle.css';
import { initDungeon } from './dungeon/initDungeon';
import { initChronicle } from './chronicle/initChronicle';
import { setupPageSize } from './chronicle/pageSize';

/* The original page loaded these as classic <script> tags placed at the
   bottom of <body>. With Vite + ES modules the entry runs after the DOM
   is parsed, so we just guard for the (already-parsed) state and call
   the initializers in the same order the original HTML used. */
function boot(): void {
  // Resolve + apply the page geometry BEFORE anything renders, so maps and the
  // Contents Key are laid out at the correct size from the first paint.
  const pageSize = setupPageSize('dungeon_');
  initDungeon();
  initChronicle('dungeon_', pageSize);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
