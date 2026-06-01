import './styles/chronicle.css';
import { initDungeon } from './dungeon';
import { initChronicle } from './chronicle';

/* The original page loaded these as classic <script> tags placed at the
   bottom of <body>. With Vite + ES modules the entry runs after the DOM
   is parsed, so we just guard for the (already-parsed) state and call
   the initializers in the same order the original HTML used. */
function boot(): void {
  initDungeon();
  initChronicle('dungeon_');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
