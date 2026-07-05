/* fonts.css first: it registers the self-hosted @font-face declarations the
   other stylesheets reference via var(--font-*). Placement is order-independent
   for @font-face correctness, but front-loading keeps the intent clear. */
import './styles/fonts.css';
/* dungeon.css must precede chronicle.css: it replaced the inline <style> block
   that the bundled stylesheet historically followed, so chronicle.css keeps
   winning equal-specificity ties (e.g. `.toolbar` positioning). */
import './styles/dungeon.css';
import './styles/chronicle.css';
import { initDungeon } from './dungeon/initDungeon';
import { initChronicle } from './chronicle/initChronicle';
import { setupPageSize } from './chronicle/pageSize';
import { fit as fitChroniclePages } from './chronicle/pageScaling';
import { attachToolbarMenuController } from './dungeon/controllers/toolbarMenuController';

/* The original page loaded these as classic <script> tags placed at the
   bottom of <body>. With Vite + ES modules the entry runs after the DOM
   is parsed, so we just guard for the (already-parsed) state and call
   the initializers in the same order the original HTML used. */
function boot(): void {
  // Resolve + apply the page geometry BEFORE anything renders, so maps and the
  // Contents Key are laid out at the correct size from the first paint.
  const pageSize = setupPageSize('dungeon_');
  // fit() no-ops until initChronicle wraps the pages, matching the old
  // synthetic-resize signal that had no listener during the initial render.
  initDungeon({ onContentsKeyLayoutChange: fitChroniclePages });
  initChronicle('dungeon_', pageSize);
  attachToolbarMenuController();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
