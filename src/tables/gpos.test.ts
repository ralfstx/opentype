import { describe, expect, it } from 'vitest';

import { type GlyphRun } from '../glyph-run.ts';
import { fromHexString } from '../test-utils.ts';
import { GposMarkBasePosSubtable } from './gpos.ts';

describe('GposMarkBasePosSubtable', () => {
  // MarkBasePosFormat1 with:
  // - 1 mark glyph (glyphId 100, class 0, anchor at x=50, y=-50)
  // - 1 base glyph (glyphId 10, class-0 anchor at x=300, y=500)
  // - markClassCount = 1
  const subtable = buildMarkBaseSubtable({
    markGlyphIds: [100],
    markRecords: [{ markClass: 0, anchor: { x: 50, y: -50 } }],
    baseGlyphIds: [10],
    baseAnchors: [[{ x: 300, y: 500 }]],
    markClassCount: 1,
  });

  it('positions a mark glyph relative to a preceding base glyph', () => {
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [65], advance: 600 },
        { glyphId: 100, codePoints: [769], advance: 0 },
      ],
    };
    const markAttachments = new Map<number, number>();

    subtable.applyToGlyphRun(glyphRun, undefined, markAttachments);

    expect(glyphRun.glyphs[1].xOffset).toBe(250); // 300 - 50
    expect(glyphRun.glyphs[1].yOffset).toBe(550); // 500 - (-50)
    expect(markAttachments.get(1)).toBe(0);
  });

  it('does not modify a mark when base glyph is not covered', () => {
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 999, codePoints: [65], advance: 600 }, // not covered
        { glyphId: 100, codePoints: [769], advance: 0 },
      ],
    };

    subtable.applyToGlyphRun(glyphRun);

    expect(glyphRun.glyphs[1].xOffset).toBeUndefined();
    expect(glyphRun.glyphs[1].yOffset).toBeUndefined();
  });

  it('does not modify a glyph that is not a covered mark', () => {
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [65], advance: 600 },
        { glyphId: 200, codePoints: [66], advance: 500 }, // not a mark
      ],
    };

    subtable.applyToGlyphRun(glyphRun);

    expect(glyphRun.glyphs[1].xOffset).toBeUndefined();
  });

  it('skips other marks when searching backward for base glyph', () => {
    const otherMarkId = 101;
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [65], advance: 600 },
        { glyphId: otherMarkId, codePoints: [770], advance: 0 },
        { glyphId: 100, codePoints: [769], advance: 0 },
      ],
    };

    // The skip function skips glyph 101 (another mark), so the lookup
    // should find base glyph 10 as the base.
    const markAttachments = new Map<number, number>();
    subtable.applyToGlyphRun(glyphRun, (id) => id === otherMarkId, markAttachments);

    expect(glyphRun.glyphs[2].xOffset).toBe(250); // 300 - 50
    expect(glyphRun.glyphs[2].yOffset).toBe(550);
    expect(markAttachments.get(2)).toBe(0);
  });

  it('does not modify a mark when its class has a NULL anchor on the base', () => {
    // markClassCount = 2, but base only has an anchor for class 0
    const nullAnchorSubtable = buildMarkBaseSubtable({
      markGlyphIds: [100],
      markRecords: [{ markClass: 1, anchor: { x: 50, y: -50 } }],
      baseGlyphIds: [10],
      baseAnchors: [[{ x: 300, y: 500 }]], // only class 0; class 1 is NULL
      markClassCount: 2,
    });

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [65], advance: 600 },
        { glyphId: 100, codePoints: [769], advance: 0 },
      ],
    };

    nullAnchorSubtable.applyToGlyphRun(glyphRun);

    expect(glyphRun.glyphs[1].xOffset).toBeUndefined();
    expect(glyphRun.glyphs[1].yOffset).toBeUndefined();
  });

  it('positions marks using the correct class anchor', () => {
    // Two mark classes: class 0 (above) and class 1 (below)
    const twoClassSubtable = buildMarkBaseSubtable({
      markGlyphIds: [100, 101],
      markRecords: [
        { markClass: 0, anchor: { x: 50, y: -50 } },
        { markClass: 1, anchor: { x: 40, y: 100 } },
      ],
      baseGlyphIds: [10],
      baseAnchors: [
        [
          { x: 300, y: 500 }, // class 0: above
          { x: 300, y: -100 }, // class 1: below
        ],
      ],
      markClassCount: 2,
    });

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [65], advance: 600 },
        { glyphId: 101, codePoints: [807], advance: 0 }, // class 1 mark
      ],
    };

    twoClassSubtable.applyToGlyphRun(glyphRun);

    expect(glyphRun.glyphs[1].xOffset).toBe(260); // 300 - 40
    expect(glyphRun.glyphs[1].yOffset).toBe(-200); // -100 - 100
  });
});

// === Test helpers ===

type Anchor = { x: number; y: number };
type MarkRecordInput = { markClass: number; anchor: Anchor };

function buildMarkBaseSubtable(opts: {
  markGlyphIds: number[];
  markRecords: MarkRecordInput[];
  baseGlyphIds: number[];
  baseAnchors: Anchor[][];
  markClassCount: number;
}): GposMarkBasePosSubtable {
  // Build the binary data for a MarkBasePosFormat1 subtable.
  // Layout:
  //   0: format (uint16) = 1
  //   2: markCoverageOffset (uint16)
  //   4: baseCoverageOffset (uint16)
  //   6: markClassCount (uint16)
  //   8: markArrayOffset (uint16)
  //  10: baseArrayOffset (uint16)
  //  12: ... coverage tables, mark array, base array

  const parts: string[] = [];

  // We'll build the sub-structures and compute offsets.
  const headerSize = 12;

  // Mark coverage (format 1)
  const markCovHex = buildCoverage1(opts.markGlyphIds);
  const markCovOffset = headerSize;

  // Base coverage (format 1)
  const baseCovHex = buildCoverage1(opts.baseGlyphIds);
  const baseCovOffset = markCovOffset + markCovHex.length / 2;

  // Mark array
  const markArrayResult = buildMarkArray(opts.markRecords);
  const markArrayOffset = baseCovOffset + baseCovHex.length / 2;

  // Base array
  const baseArrayResult = buildBaseArray(opts.baseAnchors, opts.markClassCount);
  const baseArrayOffset = markArrayOffset + markArrayResult.length / 2;

  // Header
  parts.push(uint16Hex(1)); // format
  parts.push(uint16Hex(markCovOffset));
  parts.push(uint16Hex(baseCovOffset));
  parts.push(uint16Hex(opts.markClassCount));
  parts.push(uint16Hex(markArrayOffset));
  parts.push(uint16Hex(baseArrayOffset));
  parts.push(markCovHex);
  parts.push(baseCovHex);
  parts.push(markArrayResult);
  parts.push(baseArrayResult);

  return GposMarkBasePosSubtable.read(fromHexString(parts.join('')));
}

function buildCoverage1(glyphIds: number[]): string {
  let hex = uint16Hex(1); // format
  hex += uint16Hex(glyphIds.length);
  for (const id of glyphIds) hex += uint16Hex(id);
  return hex;
}

function buildMarkArray(records: MarkRecordInput[]): string {
  // MarkArray: markCount, then markRecords (markClass + anchorOffset)
  // Anchors follow the records.
  const recordSize = 4; // 2 bytes markClass + 2 bytes offset
  const headerSize = 2; // markCount
  const anchorSize = 6; // format(2) + x(2) + y(2)

  let hex = uint16Hex(records.length);
  // Compute offsets for anchors (relative to start of MarkArray)
  const anchorsStart = headerSize + records.length * recordSize;
  for (let i = 0; i < records.length; i++) {
    hex += uint16Hex(records[i].markClass);
    hex += uint16Hex(anchorsStart + i * anchorSize);
  }
  // Write anchor tables
  for (const rec of records) {
    hex += uint16Hex(1); // AnchorFormat1
    hex += int16Hex(rec.anchor.x);
    hex += int16Hex(rec.anchor.y);
  }
  return hex;
}

function buildBaseArray(baseAnchors: Anchor[][], markClassCount: number): string {
  const baseCount = baseAnchors.length;
  const headerSize = 2; // baseCount
  const offsetsSize = baseCount * markClassCount * 2;
  const anchorSize = 6;

  let hex = uint16Hex(baseCount);
  let anchorHex = '';
  let anchorIndex = 0;

  for (const anchors of baseAnchors) {
    for (let c = 0; c < markClassCount; c++) {
      const anchor = anchors[c];
      if (anchor) {
        const anchorOffset = headerSize + offsetsSize + anchorIndex * anchorSize;
        hex += uint16Hex(anchorOffset);
        anchorHex += uint16Hex(1); // AnchorFormat1
        anchorHex += int16Hex(anchor.x);
        anchorHex += int16Hex(anchor.y);
        anchorIndex++;
      } else {
        hex += uint16Hex(0); // NULL
      }
    }
  }

  return hex + anchorHex;
}

function uint16Hex(value: number): string {
  return (value & 0xffff).toString(16).padStart(4, '0');
}

function int16Hex(value: number): string {
  return uint16Hex(value < 0 ? value + 0x10000 : value);
}
