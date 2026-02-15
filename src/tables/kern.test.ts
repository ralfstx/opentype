import { describe, expect, it } from 'vitest';

import { type GlyphRun } from '../glyph-run.ts';
import { fromHexString } from '../test-utils.ts';
import { KernTable } from './kern.ts';

describe('KernTable', () => {
  it('reads kern pairs from a version 0 / format 0 subtable', () => {
    const data = fromHexString(
      '00 00', // version 0 (Microsoft)
      '00 01', // nTables = 1
      // Subtable header
      '00 00', // subtable version
      '00 1a', // length = 26 (6 header + 8 format0 header + 2*6 pairs)
      '00 01', // coverage: format 0, horizontal
      // Format 0 data
      '00 02', // nPairs = 2
      '00 0c', // searchRange
      '00 01', // entrySelector
      '00 00', // rangeShift
      // Pair 1: glyph 10 + glyph 20 = -50
      '00 0a 00 14 ff ce',
      // Pair 2: glyph 30 + glyph 40 = -100
      '00 1e 00 28 ff 9c',
    );

    const table = KernTable.read(data);

    expect(table).toBeDefined();
    expect(table!.getKerning(10, 20)).toBe(-50);
    expect(table!.getKerning(30, 40)).toBe(-100);
  });

  it('returns 0 for unknown glyph pairs', () => {
    const data = fromHexString(
      '00 00', // version 0
      '00 01', // nTables = 1
      '00 00', // subtable version
      '00 14', // length = 20 (6 header + 8 format0 header + 1*6 pair)
      '00 01', // coverage: format 0, horizontal
      '00 01', // nPairs = 1
      '00 06', // searchRange
      '00 00', // entrySelector
      '00 00', // rangeShift
      '00 0a 00 14 ff ce', // glyph 10 + glyph 20 = -50
    );

    const table = KernTable.read(data)!;

    expect(table.getKerning(10, 20)).toBe(-50);
    expect(table.getKerning(10, 99)).toBe(0);
    expect(table.getKerning(99, 20)).toBe(0);
  });

  it('applies kerning to a glyph run', () => {
    const data = fromHexString(
      '00 00', // version 0
      '00 01', // nTables = 1
      '00 00', // subtable version
      '00 14', // length = 20
      '00 01', // coverage: format 0, horizontal
      '00 01', // nPairs = 1
      '00 06', // searchRange
      '00 00', // entrySelector
      '00 00', // rangeShift
      '00 0a 00 14 ff ce', // glyph 10 + glyph 20 = -50
    );

    const table = KernTable.read(data)!;
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [65], advance: 500 },
        { glyphId: 20, codePoints: [66], advance: 600 },
        { glyphId: 30, codePoints: [67], advance: 700 },
      ],
    };

    table.applyToGlyphRun(glyphRun);

    expect(glyphRun.glyphs[0].advanceAdjust).toBe(-50);
    expect(glyphRun.glyphs[1].advanceAdjust).toBeUndefined();
    expect(glyphRun.glyphs[2].advanceAdjust).toBeUndefined();
  });

  it('accumulates kerning with existing advanceAdjust', () => {
    const data = fromHexString(
      '00 00', // version 0
      '00 01', // nTables = 1
      '00 00', // subtable version
      '00 14', // length = 20
      '00 01', // coverage: format 0, horizontal
      '00 01', // nPairs = 1
      '00 06', // searchRange
      '00 00', // entrySelector
      '00 00', // rangeShift
      '00 0a 00 14 ff ce', // glyph 10 + glyph 20 = -50
    );

    const table = KernTable.read(data)!;
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [65], advance: 500, advanceAdjust: -10 },
        { glyphId: 20, codePoints: [66], advance: 600 },
      ],
    };

    table.applyToGlyphRun(glyphRun);

    expect(glyphRun.glyphs[0].advanceAdjust).toBe(-60);
  });

  it('skips non-horizontal subtables', () => {
    const data = fromHexString(
      '00 00', // version 0
      '00 01', // nTables = 1
      '00 00', // subtable version
      '00 14', // length = 20 (6 header + 8 format0 header + 1*6 pair)
      '00 00', // coverage: format 0, vertical (bit 0 = 0)
      '00 01', // nPairs = 1
      '00 06', // searchRange
      '00 00', // entrySelector
      '00 00', // rangeShift
      '00 0a 00 14 ff ce', // glyph 10 + glyph 20 = -50
    );

    const table = KernTable.read(data)!;

    expect(table.getKerning(10, 20)).toBe(0);
  });

  it('skips cross-stream subtables', () => {
    const data = fromHexString(
      '00 00', // version 0
      '00 01', // nTables = 1
      '00 00', // subtable version
      '00 14', // length = 20
      '00 05', // coverage: format 0, horizontal + cross-stream
      '00 01', // nPairs = 1
      '00 06', // searchRange
      '00 00', // entrySelector
      '00 00', // rangeShift
      '00 0a 00 14 ff ce', // glyph 10 + glyph 20 = -50
    );

    const table = KernTable.read(data)!;

    expect(table.getKerning(10, 20)).toBe(0);
  });

  it('skips non-format-0 subtables', () => {
    const data = fromHexString(
      '00 00', // version 0
      '00 01', // nTables = 1
      '00 00', // subtable version
      '00 14', // length = 20
      '02 01', // coverage: format 2, horizontal
      '00 01', // nPairs = 1
      '00 06', // searchRange
      '00 00', // entrySelector
      '00 00', // rangeShift
      '00 0a 00 14 ff ce', // glyph 10 + glyph 20 = -50
    );

    const table = KernTable.read(data)!;

    expect(table.getKerning(10, 20)).toBe(0);
  });

  it('reads multiple subtables', () => {
    const data = fromHexString(
      '00 00', // version 0
      '00 02', // nTables = 2
      // Subtable 1
      '00 00', // subtable version
      '00 14', // length = 20
      '00 01', // coverage: format 0, horizontal
      '00 01', // nPairs = 1
      '00 06', // searchRange
      '00 00', // entrySelector
      '00 00', // rangeShift
      '00 0a 00 14 ff ce', // glyph 10 + glyph 20 = -50
      // Subtable 2
      '00 00', // subtable version
      '00 14', // length = 20
      '00 01', // coverage: format 0, horizontal
      '00 01', // nPairs = 1
      '00 06', // searchRange
      '00 00', // entrySelector
      '00 00', // rangeShift
      '00 1e 00 28 ff 9c', // glyph 30 + glyph 40 = -100
    );

    const table = KernTable.read(data)!;

    expect(table.getKerning(10, 20)).toBe(-50);
    expect(table.getKerning(30, 40)).toBe(-100);
  });

  it('handles empty table with no subtables', () => {
    const data = fromHexString(
      '00 00', // version 0
      '00 00', // nTables = 0
    );

    const table = KernTable.read(data)!;

    expect(table.getKerning(10, 20)).toBe(0);
  });

  it('returns undefined for Apple-style version 1 tables', () => {
    const data = fromHexString(
      '00 01', // version high word = 1 (Apple fixed-point 1.0)
      '00 00', // version low word
      // The rest would be Apple subtables, but since version=1, we skip
    );

    const table = KernTable.read(data);

    expect(table).toBeUndefined();
  });
});
