import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { Font } from './font.ts';
import { TextShaper } from './text-shaper.ts';

describe('TextShaper (golden)', () => {
  let font: Font;

  beforeAll(async () => {
    const fileName = new URL('../fonts/dejavu/DejaVuSans.ttf', import.meta.url).pathname;
    const fontData = await readFile(fileName);
    font = Font.fromData(fontData);
  });

  it('supports kerning', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Ta', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 55, codePoints: [84], advance: 1251, advanceAdjust: -339 },
      { glyphId: 68, codePoints: [97], advance: 1255 },
    ]);
  });

  it('supports ligatures', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('ffl', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([{ glyphId: 5045, codePoints: [102, 102, 108], advance: 1980 }]);
  });

  it('supports default features', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Waffle', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 58, codePoints: [87], advance: 2025, advanceAdjust: -131 }, // kerning applied
      { glyphId: 68, codePoints: [97], advance: 1255 },
      { glyphId: 5045, codePoints: [102, 102, 108], advance: 1980 }, // ligature applied
      { glyphId: 72, codePoints: [101], advance: 1260 },
    ]);
  });

  it('supports disabling default features', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Waffle', { scriptTag: 'latn', defaultFeatures: false });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 58, codePoints: [87], advance: 2025 },
      { glyphId: 68, codePoints: [97], advance: 1255 },
      { glyphId: 73, codePoints: [102], advance: 721 },
      { glyphId: 73, codePoints: [102], advance: 721 },
      { glyphId: 79, codePoints: [108], advance: 569 },
      { glyphId: 72, codePoints: [101], advance: 1260 },
    ]);
  });

  it('supports enabling and disabling features', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Waffle', {
      scriptTag: 'latn',
      features: { liga: false, salt: true }, // Disable ligatures, enable stylistic alternates
    });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 58, codePoints: [87], advance: 2025 },
      { glyphId: 531, codePoints: [97], advance: 1300 }, // alternative 'a'
      { glyphId: 73, codePoints: [102], advance: 721 },
      { glyphId: 73, codePoints: [102], advance: 721 },
      { glyphId: 6005, codePoints: [108], advance: 569 }, // alternative 'l'
      { glyphId: 72, codePoints: [101], advance: 1260 },
    ]);
  });
});
