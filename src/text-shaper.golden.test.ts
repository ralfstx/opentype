import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { Font } from './font.ts';
import { TextShaper } from './text-shaper.ts';

describe('TextShaper (golden, Gentium)', () => {
  let font: Font;

  beforeAll(async () => {
    const fileName = new URL('../fonts/gentium/Gentium-Regular.ttf', import.meta.url).pathname;
    const fontData = await readFile(fileName);
    font = Font.fromData(fontData);
  });

  it('supports Latin kerning', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('AV', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 36, codePoints: [65], advance: 1219, advanceAdjust: -200 },
      { glyphId: 57, codePoints: [86], advance: 1331 },
    ]);
  });

  it('supports Cyrillic kerning', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Та', { scriptTag: 'cyrl' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 1822, codePoints: [1058], advance: 1128, advanceAdjust: -90 },
      { glyphId: 227, codePoints: [1072], advance: 950 },
    ]);
  });

  it('supports Greek kerning', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('ΑΥ', { scriptTag: 'grek' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 385, codePoints: [913], advance: 1219, advanceAdjust: -201 },
      { glyphId: 2096, codePoints: [933], advance: 1194 },
    ]);
  });

  it('supports ligatures', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('ffi', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([{ glyphId: 793, codePoints: [102, 102, 105], advance: 1829 }]);
  });

  it('supports small caps via single substitution', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('abc', { scriptTag: 'latn', features: { smcp: true } });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 3800, codePoints: [97], advance: 1146 },
      { glyphId: 3900, codePoints: [98], advance: 1058 },
      { glyphId: 3920, codePoints: [99], advance: 1032 },
    ]);
  });

  it('supports default features', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Waffle', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 58, codePoints: [87], advance: 1741, advanceAdjust: -100 }, // kerning
      { glyphId: 68, codePoints: [97], advance: 940 },
      { glyphId: 796, codePoints: [102, 102, 108], advance: 1829 }, // ffl ligature
      { glyphId: 72, codePoints: [101], advance: 946 },
    ]);
  });

  it('supports disabling default features', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Waffle', { scriptTag: 'latn', defaultFeatures: false });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 58, codePoints: [87], advance: 1741 },
      { glyphId: 68, codePoints: [97], advance: 940 },
      { glyphId: 73, codePoints: [102], advance: 637 },
      { glyphId: 73, codePoints: [102], advance: 637 },
      { glyphId: 79, codePoints: [108], advance: 555 },
      { glyphId: 72, codePoints: [101], advance: 946 },
    ]);
  });
});

describe('TextShaper (golden, Noto Sans)', () => {
  let font: Font;

  beforeAll(async () => {
    const fileName = new URL('../fonts/noto-sans/NotoSans-Regular.ttf', import.meta.url).pathname;
    const fontData = await readFile(fileName);
    font = Font.fromData(fontData);
  });

  it('supports Latin kerning', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Ta', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 55, codePoints: [84], advance: 556, advanceAdjust: -80 },
      { glyphId: 68, codePoints: [97], advance: 561 },
    ]);
  });

  it('supports Greek kerning', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Τα', { scriptTag: 'grek' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 368, codePoints: [932], advance: 556, advanceAdjust: -70 },
      { glyphId: 381, codePoints: [945], advance: 623 },
    ]);
  });

  it('supports ligatures', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('fi', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([{ glyphId: 1654, codePoints: [102, 105], advance: 602 }]);
  });

  it('supports small caps via single substitution', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('abc', { scriptTag: 'latn', features: { smcp: true } });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 1868, codePoints: [97], advance: 528 },
      { glyphId: 1881, codePoints: [98], advance: 525 },
      { glyphId: 1882, codePoints: [99], advance: 514 },
    ]);
  });

  it('supports capitals to small caps via single substitution', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('ABC', { scriptTag: 'latn', features: { c2sc: true } });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 1868, codePoints: [65], advance: 528 },
      { glyphId: 1881, codePoints: [66], advance: 525 },
      { glyphId: 1882, codePoints: [67], advance: 514 },
    ]);
  });

  it('supports default features', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Waffle', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 58, codePoints: [87], advance: 930, advanceAdjust: -20 }, // kerning
      { glyphId: 68, codePoints: [97], advance: 561 },
      { glyphId: 1657, codePoints: [102, 102, 108], advance: 946 }, // ffl ligature
      { glyphId: 72, codePoints: [101], advance: 564 },
    ]);
  });

  it('supports disabling default features', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('Waffle', { scriptTag: 'latn', defaultFeatures: false });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 58, codePoints: [87], advance: 930 },
      { glyphId: 68, codePoints: [97], advance: 561 },
      { glyphId: 73, codePoints: [102], advance: 344 },
      { glyphId: 73, codePoints: [102], advance: 344 },
      { glyphId: 79, codePoints: [108], advance: 258 },
      { glyphId: 72, codePoints: [101], advance: 564 },
    ]);
  });

  it('forms ligatures while ignoring combining marks', () => {
    const shaper = new TextShaper(font);

    // The liga lookup has the IGNORE_MARKS flag set. The combining acute
    // is a mark glyph (GDEF class 3), so the lookup skips over it and
    // still matches the f+i sequence to form the ligature.
    const glyphRun = shaper.shape('f\u0301i', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 1654, codePoints: [102, 105], advance: 602 }, // fi ligature
      { glyphId: 2665, codePoints: [769], advance: 0 }, // combining acute, moved after ligature
    ]);
  });

  it('applies kerning through combining marks via mark filtering', () => {
    const shaper = new TextShaper(font);

    // The kern lookup uses USE_MARK_FILTERING_SET=1. The combining acute
    // is not in set 1, so the lookup skips over it and still kerns T+a.
    const glyphRun = shaper.shape('T\u0301a', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 55, codePoints: [84], advance: 556, advanceAdjust: -80 }, // T with kern
      { glyphId: 2665, codePoints: [769], advance: 0 }, // combining acute
      { glyphId: 68, codePoints: [97], advance: 561 }, // a
    ]);
  });
});
