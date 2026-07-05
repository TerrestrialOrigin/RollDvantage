import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* Guards the self-host-fonts wiring: the app must register the local @font-face
   declarations (not remote Google Fonts) for all three display families, with
   the same font-display behaviour and the local woff2 assets present. jsdom
   cannot rasterize glyphs, so this asserts declaration + asset presence; the
   offline E2E (e2e/selfHostFonts.spec.ts) proves the faces actually load. */

const stylesDir = join(__dirname);
const fontsCss = readFileSync(join(stylesDir, 'fonts.css'), 'utf8');
const mainTs = readFileSync(join(stylesDir, '..', 'main.ts'), 'utf8');

const FAMILIES = ['Cinzel', 'Cinzel Decorative', 'Cormorant Garamond'] as const;

describe('self-hosted fonts', () => {
  it('is imported by the app entry ahead of the other stylesheets', () => {
    expect(mainTs).toContain("import './styles/fonts.css'");
    const fontsIndex = mainTs.indexOf("import './styles/fonts.css'");
    const dungeonIndex = mainTs.indexOf("import './styles/dungeon.css'");
    const chronicleIndex = mainTs.indexOf("import './styles/chronicle.css'");
    expect(fontsIndex).toBeGreaterThanOrEqual(0);
    expect(fontsIndex).toBeLessThan(dungeonIndex);
    expect(fontsIndex).toBeLessThan(chronicleIndex);
  });

  it('declares @font-face for every display family', () => {
    for (const family of FAMILIES) {
      expect(fontsCss).toContain(`font-family: '${family}'`);
    }
  });

  it('keeps font-display: swap on every face', () => {
    const faceCount = (fontsCss.match(/@font-face/g) ?? []).length;
    const swapCount = (fontsCss.match(/font-display:\s*swap/g) ?? []).length;
    expect(faceCount).toBeGreaterThan(0);
    expect(swapCount).toBe(faceCount);
  });

  it('ships both the latin and latin-ext subsets', () => {
    // latin covers U+0000-00FF; latin-ext adds U+0100-02BA — both must be present.
    expect(fontsCss).toContain('U+0000-00FF');
    expect(fontsCss).toContain('U+0100-02BA');
  });

  it('references only local woff2 assets — no remote font origin', () => {
    expect(fontsCss).not.toContain('fonts.googleapis.com');
    expect(fontsCss).not.toContain('fonts.gstatic.com');
    expect(fontsCss).not.toMatch(/src:\s*url\(https?:/);
    expect(fontsCss).toMatch(/src:\s*url\(\.\/fonts\/[^)]+\.woff2\)/);
  });

  it('every woff2 referenced by fonts.css exists on disk', () => {
    const referenced = [...fontsCss.matchAll(/url\(\.\/fonts\/([^)]+\.woff2)\)/g)]
      .map((match) => match[1])
      .filter((file): file is string => file !== undefined);
    expect(referenced.length).toBeGreaterThan(0);
    const onDisk = new Set(readdirSync(join(stylesDir, 'fonts')));
    for (const file of referenced) {
      expect(onDisk.has(file)).toBe(true);
    }
  });
});
