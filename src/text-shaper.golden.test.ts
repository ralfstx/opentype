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

  it('applies Serbian locl substitutions for Cyrillic with langSysTag', () => {
    const shaper = new TextShaper(font);

    // Serbian locl replaces б г д п т with alternate forms
    const glyphRun = shaper.shape('бгдпт', { scriptTag: 'cyrl', langSysTag: 'SRB' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 460, codePoints: [1073], advance: 977 },
      { glyphId: 812, codePoints: [1075], advance: 848 },
      { glyphId: 1143, codePoints: [1076], advance: 1065 },
      { glyphId: 946, codePoints: [1087], advance: 1135 },
      { glyphId: 1816, codePoints: [1090], advance: 954 },
    ]);
  });

  it('does not apply Serbian locl when using default Cyrillic', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('бгдпт', { scriptTag: 'cyrl' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 457, codePoints: [1073], advance: 1027 },
      { glyphId: 809, codePoints: [1075], advance: 848 },
      { glyphId: 1140, codePoints: [1076], advance: 1065 },
      { glyphId: 943, codePoints: [1087], advance: 1135 },
      { glyphId: 1814, codePoints: [1090], advance: 954 },
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

  it('supports character variants via alternate substitution', () => {
    const shaper = new TextShaper(font);

    // The cv13 feature uses a Type 3 (alternate substitution) lookup that
    // replaces U+0181 (Ɓ, Latin Capital Letter B with Hook) with an alternate form.
    const glyphRun = shaper.shape('\u0181', { scriptTag: 'latn', features: { cv13: true } });

    expect(glyphRun.glyphs).toEqual([{ glyphId: 492, codePoints: [0x181], advance: 1126 }]);
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

  it('supports ccmp context substitution (dotless-i before combining mark)', () => {
    const shaper = new TextShaper(font);

    // The ccmp feature uses a Type 5 (context substitution) lookup that
    // replaces 'i' with a dotless variant when followed by a combining mark.
    const glyphRun = shaper.shape('i\u0363', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 1046, codePoints: [105], advance: 555 }, // dotless-i variant
      { glyphId: 234, codePoints: [867], advance: 0, xOffset: 225, yOffset: 0 }, // combining latin small letter a
    ]);
  });

  it('supports fractions via chaining contextual substitution', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('1/2', { scriptTag: 'latn', features: { frac: true } });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 2228, codePoints: [49], advance: 530 }, // numerator 1
      { glyphId: 2322, codePoints: [47], advance: 156 }, // fraction slash
      { glyphId: 2234, codePoints: [50], advance: 530 }, // denominator 2
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

  it('applies Serbian locl substitution for Cyrillic with langSysTag', () => {
    const shaper = new TextShaper(font);

    // Serbian locl replaces б with an alternate form
    const glyphRun = shaper.shape('бгдпт', { scriptTag: 'cyrl', langSysTag: 'SRB ' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 2092, codePoints: [1073], advance: 604 }, // б substituted
      { glyphId: 459, codePoints: [1075], advance: 438, advanceAdjust: -40 },
      { glyphId: 460, codePoints: [1076], advance: 607 },
      { glyphId: 471, codePoints: [1087], advance: 606 },
      { glyphId: 474, codePoints: [1090], advance: 465 },
    ]);
  });

  it('does not apply Serbian locl when using default Cyrillic', () => {
    const shaper = new TextShaper(font);

    const glyphRun = shaper.shape('бгдпт', { scriptTag: 'cyrl' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 457, codePoints: [1073], advance: 597 },
      { glyphId: 459, codePoints: [1075], advance: 438, advanceAdjust: -40 },
      { glyphId: 460, codePoints: [1076], advance: 607 },
      { glyphId: 471, codePoints: [1087], advance: 606 },
      { glyphId: 474, codePoints: [1090], advance: 465 },
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

  it('supports ccmp decomposition via multiple substitution', () => {
    const shaper = new TextShaper(font);

    // The ccmp feature uses a Type 2 (multiple substitution) lookup that
    // decomposes precomposed characters into base + combining mark.
    // U+1E3F (ḿ) → m (glyph 80) + combining acute (glyph 2665)
    const glyphRun = shaper.shape('\u1e3f', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 80, codePoints: [0x1e3f], advance: 935 }, // m
      { glyphId: 2665, codePoints: [], advance: 0, xOffset: -184, yOffset: 0 }, // combining acute (mark-to-base)
    ]);
  });

  it('applies kerning through combining marks via mark filtering', () => {
    const shaper = new TextShaper(font);

    // The kern lookup uses USE_MARK_FILTERING_SET=1. The combining acute
    // is not in set 1, so the lookup skips over it and still kerns T+a.
    const glyphRun = shaper.shape('T\u0301a', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 55, codePoints: [84], advance: 556, advanceAdjust: -80 }, // T with kern
      { glyphId: 2665, codePoints: [769], advance: 0, xOffset: 74, yOffset: 178 }, // combining acute (mark-to-base)
      { glyphId: 68, codePoints: [97], advance: 561 }, // a
    ]);
  });

  it('positions combining marks on base glyphs via mark-to-base attachment', () => {
    const shaper = new TextShaper(font);

    // e + combining acute: the mark feature uses GPOS type 4 to position
    // the combining acute relative to the base glyph 'e'.
    const glyphRun = shaper.shape('e\u0301', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 72, codePoints: [101], advance: 564 }, // e
      { glyphId: 2665, codePoints: [769], advance: 0, xOffset: -7, yOffset: 0 }, // combining acute (mark-to-base)
    ]);
  });

  it('stacks combining marks via mark-to-mark attachment', () => {
    const shaper = new TextShaper(font);

    // a + combining circumflex + combining acute: the mkmk feature uses
    // GPOS type 6 to stack the acute on top of the circumflex. Both marks
    // end up centered on the base glyph (base anchor x = 281).
    const glyphRun = shaper.shape('a\u0302\u0301', { scriptTag: 'latn' });

    expect(glyphRun.glyphs).toEqual([
      { glyphId: 68, codePoints: [97], advance: 561 }, // a
      { glyphId: 2667, codePoints: [770], advance: 0, xOffset: -282, yOffset: 0 }, // combining circumflex (mark-to-base)
      { glyphId: 2665, codePoints: [769], advance: 0, xOffset: -8, yOffset: 229 }, // combining acute (mark-to-mark)
    ]);
  });
});
