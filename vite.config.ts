import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const isElectron = process.env.BUILD_TARGET === 'electron';

/* CSP hashes must cover the exact byte content of each inline script, so the
   hashes are computed from the final HTML at build time — they can never drift
   from the scripts they allow. */
const inlineScriptHashes = (html: string): string[] => {
  const inlineScriptPattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const hashes: string[] = [];
  for (const scriptMatch of html.matchAll(inlineScriptPattern)) {
    const scriptContent = scriptMatch[1];
    if (scriptContent === undefined || scriptContent.trim() === '') continue;
    const digest = createHash('sha256').update(scriptContent).digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
};

const buildCspContent = (html: string): string => {
  const scriptSources = ["'self'", ...inlineScriptHashes(html)].join(' ');
  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    // Fonts are self-hosted (bundled woff2, see src/styles/fonts.css), so no
    // remote style/font origin is whitelisted — do not reintroduce one.
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
  ].join('; ');
};

/* The Electron renderer loads from file://, where HTTP-header CSP is unreliable,
   so the policy ships as a meta tag injected only into the Electron build. */
const electronCspPlugin = (): Plugin => ({
  name: 'electron-csp',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCspContent(html) },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  },
});

// https://vite.dev/config/
export default defineConfig({
  base: isElectron ? './' : '/', // Use a relative base for Electron, absolute for Capacitor
  plugins: isElectron ? [electronCspPlugin()] : [],
  build: {
    outDir: isElectron ? 'dist-electron' : 'dist',
    rollupOptions: {
      // Multi-page: the app entry plus the standalone Terms & License page, so
      // both are processed by Vite and share the bundled, self-hosted fonts.
      input: {
        main: resolve(__dirname, 'index.html'),
        license: resolve(__dirname, 'License.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: [...configDefaults.exclude, 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/test-setup.ts'],
      reporter: ['text-summary'],
      /* A regression floor set just below the current measured coverage — it
         catches coverage sliding backward without being a target to chase.
         Much of the UI/controller glue is covered by the Playwright E2E suite,
         which this unit-coverage number does not see. Raise as gaps are filled. */
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 52,
        lines: 54,
      },
    },
  }
})
