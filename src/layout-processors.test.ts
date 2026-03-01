import { describe, expect, it } from 'vitest';

import { type GlyphRun } from './glyph-run.ts';
import { createSkipFn } from './layout-processors.ts';
import { LookupFlags, type LookupTable } from './tables/common/lookup-list.ts';
import { type GdefTable, GlyphClass } from './tables/gdef.ts';
import { GposSinglePosSubtable } from './tables/gpos.ts';
import {
  GsubChainingContextSubstSubtable,
  GsubLigatureSubstSubtable,
  GsubSingleSubstSubtable,
  readAllGsubSubtables,
  readGsubSubtable,
} from './tables/gsub.ts';
import { fromHexString } from './test-utils.ts';

describe('createSkipFn', () => {
  it('returns undefined when no filtering flags are set', () => {
    const skip = createSkipFn(0, undefined, undefined);

    expect(skip).toBeUndefined();
  });

  it('returns undefined when only RIGHT_TO_LEFT is set', () => {
    const skip = createSkipFn(LookupFlags.RIGHT_TO_LEFT, undefined, undefined);

    expect(skip).toBeUndefined();
  });

  describe('IGNORE_BASE_GLYPHS', () => {
    it('skips base glyphs', () => {
      const gdef = createMockGdef({ 10: GlyphClass.Base, 20: GlyphClass.Mark });
      const skip = createSkipFn(LookupFlags.IGNORE_BASE_GLYPHS, undefined, gdef)!;

      expect(skip(10)).toBe(true);
      expect(skip(20)).toBe(false);
    });

    it('does not skip when GDEF is absent', () => {
      const skip = createSkipFn(LookupFlags.IGNORE_BASE_GLYPHS, undefined, undefined)!;

      expect(skip(10)).toBe(false);
    });
  });

  describe('IGNORE_LIGATURES', () => {
    it('skips ligature glyphs', () => {
      const gdef = createMockGdef({ 10: GlyphClass.Ligature, 20: GlyphClass.Base });
      const skip = createSkipFn(LookupFlags.IGNORE_LIGATURES, undefined, gdef)!;

      expect(skip(10)).toBe(true);
      expect(skip(20)).toBe(false);
    });
  });

  describe('IGNORE_MARKS', () => {
    it('skips all marks when no filtering is specified', () => {
      const gdef = createMockGdef({ 10: GlyphClass.Mark, 20: GlyphClass.Base });
      const skip = createSkipFn(LookupFlags.IGNORE_MARKS, undefined, gdef)!;

      expect(skip(10)).toBe(true);
      expect(skip(20)).toBe(false);
    });

    it('with MARK_ATTACHMENT_CLASS_FILTER, skips marks not in the class', () => {
      const markAttachClass = 2;
      const flag = LookupFlags.IGNORE_MARKS | (markAttachClass << 8);
      const gdef = createMockGdef({ 10: GlyphClass.Mark, 20: GlyphClass.Mark, 30: GlyphClass.Base }, { 10: 2, 20: 3 });
      const skip = createSkipFn(flag, undefined, gdef)!;

      expect(skip(10)).toBe(false); // mark in class 2 — keep
      expect(skip(20)).toBe(true); // mark in class 3 — skip
      expect(skip(30)).toBe(false); // base — not affected
    });

    it('with USE_MARK_FILTERING_SET, skips marks not in the set', () => {
      const flag = LookupFlags.IGNORE_MARKS | LookupFlags.USE_MARK_FILTERING_SET;
      const gdef = createMockGdef(
        { 10: GlyphClass.Mark, 20: GlyphClass.Mark, 30: GlyphClass.Base },
        {},
        { 0: new Set([10]) },
      );
      const skip = createSkipFn(flag, 0, gdef)!;

      expect(skip(10)).toBe(false); // mark in set 0 — keep
      expect(skip(20)).toBe(true); // mark not in set 0 — skip
      expect(skip(30)).toBe(false); // base — not affected
    });

    it('USE_MARK_FILTERING_SET takes precedence over MARK_ATTACHMENT_CLASS_FILTER', () => {
      const markAttachClass = 2;
      const flag = LookupFlags.IGNORE_MARKS | LookupFlags.USE_MARK_FILTERING_SET | (markAttachClass << 8);
      const gdef = createMockGdef(
        { 10: GlyphClass.Mark, 20: GlyphClass.Mark },
        { 10: 2, 20: 2 }, // both in attachment class 2
        { 0: new Set([10]) }, // only glyph 10 in set 0
      );
      const skip = createSkipFn(flag, 0, gdef)!;

      // Even though glyph 20 is in attachment class 2, mark filtering set
      // takes precedence and glyph 20 is not in set 0
      expect(skip(10)).toBe(false);
      expect(skip(20)).toBe(true);
    });
  });

  describe('USE_MARK_FILTERING_SET without IGNORE_MARKS', () => {
    it('returns a skip function', () => {
      const flag = LookupFlags.USE_MARK_FILTERING_SET;
      const gdef = createMockGdef({ 10: GlyphClass.Mark }, {}, { 0: new Set([10]) });
      const skip = createSkipFn(flag, 0, gdef);

      expect(skip).toBeDefined();
    });

    it('skips marks not in the set', () => {
      const flag = LookupFlags.USE_MARK_FILTERING_SET;
      const gdef = createMockGdef(
        { 10: GlyphClass.Mark, 20: GlyphClass.Mark, 30: GlyphClass.Base },
        {},
        { 0: new Set([10]) },
      );
      const skip = createSkipFn(flag, 0, gdef)!;

      expect(skip(10)).toBe(false); // mark in set 0 — keep
      expect(skip(20)).toBe(true); // mark not in set 0 — skip
      expect(skip(30)).toBe(false); // base — not affected
    });
  });

  describe('MARK_ATTACHMENT_CLASS_FILTER without IGNORE_MARKS', () => {
    it('skips marks not in the attachment class', () => {
      const markAttachClass = 1;
      const flag = markAttachClass << 8; // no IGNORE_MARKS
      const gdef = createMockGdef({ 10: GlyphClass.Mark, 20: GlyphClass.Mark, 30: GlyphClass.Base }, { 10: 1, 20: 2 });
      const skip = createSkipFn(flag, undefined, gdef)!;

      expect(skip(10)).toBe(false); // mark in class 1 — keep
      expect(skip(20)).toBe(true); // mark in class 2 — skip
      expect(skip(30)).toBe(false); // base — not affected
    });
  });

  describe('combined flags', () => {
    it('skips base glyphs and marks together', () => {
      const flag = LookupFlags.IGNORE_BASE_GLYPHS | LookupFlags.IGNORE_MARKS;
      const gdef = createMockGdef({
        10: GlyphClass.Base,
        20: GlyphClass.Ligature,
        30: GlyphClass.Mark,
      });
      const skip = createSkipFn(flag, undefined, gdef)!;

      expect(skip(10)).toBe(true); // base — skip
      expect(skip(20)).toBe(false); // ligature — keep
      expect(skip(30)).toBe(true); // mark — skip
    });
  });
});

describe('GposSinglePosSubtable with skip', () => {
  it('skips glyphs matched by the skip predicate', () => {
    // Format 1 SinglePos: applies xAdvance=+50 to all covered glyphs
    // Coverage covers glyph IDs 10 and 20
    const data = fromHexString(
      '0001', // format 1
      '0008', // coverageOffset = 8
      '0004', // valueFormat = xAdvance only
      '0032', // xAdvance = 50
      '0001', // coverage format 1
      '0002', // glyphCount = 2
      '000A', // glyphId = 10
      '0014', // glyphId = 20
    );
    const subtable = GposSinglePosSubtable.read(data);
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [65], advance: 500 },
        { glyphId: 20, codePoints: [66], advance: 600 },
      ],
    };
    const skip = (glyphId: number) => glyphId === 20;

    subtable.applyToGlyphRun(glyphRun, skip);

    expect(glyphRun.glyphs[0].advanceAdjust).toBe(50); // not skipped
    expect(glyphRun.glyphs[1].advanceAdjust).toBeUndefined(); // skipped
  });
});

describe('GsubLigatureSubstSubtable with skip', () => {
  it('matches ligature components across skipped glyphs', () => {
    // Ligature substitution: glyphs 10+20 → ligature glyph 99
    // Byte offsets (from start of subtable):
    //   0: header (8 bytes)
    //   8: LigatureSet (4 bytes: count + 1 offset)
    //  12: Ligature (6 bytes: ligGlyph + compCount + 1 compGlyphID)
    //  18: Coverage (6 bytes: format + count + 1 glyphId)
    const data = fromHexString(
      // Subtable header (offset 0)
      '0001', // format 1
      '0012', // coverageOffset = 18
      '0001', // ligatureSetCount = 1
      '0008', // ligatureSetOffsets[0] = 8 (from subtable start)
      // LigatureSet (offset 8, offsets relative to offset 8)
      '0001', // ligatureCount = 1
      '0004', // ligatureOffsets[0] = 4 (from LigatureSet start = offset 12)
      // Ligature (offset 12)
      '0063', // ligGlyph = 99
      '0002', // compCount = 2 (first glyph + 1 component)
      '0014', // compGlyphIDs[0] = 20
      // Coverage (offset 18)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '000A', // glyphId = 10
    );
    const subtable = GsubLigatureSubstSubtable.read(data);
    // Glyph run: base(10), mark(30, skipped), base(20)
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [102], advance: 500 },
        { glyphId: 30, codePoints: [0x300], advance: 0 },
        { glyphId: 20, codePoints: [105], advance: 400 },
      ],
    };
    const skip = (glyphId: number) => glyphId === 30;

    subtable.applyToGlyphRun(glyphRun, undefined, skip);

    // Ligature replaces glyph 10 and 20, skipped glyph 30 is preserved
    expect(glyphRun.glyphs).toHaveLength(2);
    expect(glyphRun.glyphs[0].glyphId).toBe(99);
    expect(glyphRun.glyphs[0].codePoints).toEqual([102, 105]);
    expect(glyphRun.glyphs[1].glyphId).toBe(30); // mark preserved
  });
});

describe('readGsubSubtable — Extension (Type 7)', () => {
  it('unwraps extension to inner single substitution subtable', () => {
    // Extension header (8 bytes) followed by a SingleSubst Format 2 subtable.
    // Extension offset points to byte 8 (right after the header).
    const data = fromHexString(
      // Extension header (offset 0)
      '0001', // format = 1
      '0001', // extensionLookupType = 1 (single subst)
      '0000 0008', // extensionOffset = 8
      // SingleSubst Format 2 (offset 8, all offsets below relative to here)
      '0002', // format = 2
      '0008', // coverageOffset = 8
      '0001', // glyphCount = 1
      '0042', // substituteGlyphIds[0] = 66
      // Coverage (offset 8 from SingleSubst start = byte 16 overall)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '0041', // glyphId = 65
    );
    const lookupTable: LookupTable = {
      lookupType: 7,
      lookupFlag: 0,
      subTableCount: 1,
      getSubTableData: () => data,
    };

    const subtable = readGsubSubtable(lookupTable, 0);

    expect(subtable).toBeInstanceOf(GsubSingleSubstSubtable);
    // Verify it works: substitute glyph 65 → 66
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 65, codePoints: [65], advance: 500 }],
    };
    subtable!.applyAtIndex(glyphRun, 0, () => 600);
    expect(glyphRun.glyphs[0].glyphId).toBe(66);
    expect(glyphRun.glyphs[0].advance).toBe(600);
  });
});

describe('readAllGsubSubtables — Extension-wrapped Type 6 consolidation', () => {
  // Builds an extension-wrapped (Type 7) chaining contextual subtable (Type 6
  // Format 3) with a single input coverage matching `inputGlyphId` and one
  // substitution record referencing `lookupIndex` at glyph sequence index 0.
  function buildExtensionWrappedChainingRule(inputGlyphId: number, lookupIndex: number): DataView {
    return fromHexString(
      // Extension header (offset 0, 8 bytes)
      '0001', // format = 1
      '0006', // extensionLookupType = 6 (chaining context)
      '0000 0008', // extensionOffset = 8

      // Type 6 Format 3 subtable (offset 8, offsets below relative to here)
      '0003', // format = 3
      '0000', // backtrackGlyphCount = 0
      '0001', // inputGlyphCount = 1
      '0010', // inputCoverageOffset = 16 (relative to subtable start)
      '0000', // lookaheadGlyphCount = 0
      '0001', // substCount = 1
      '0000', // substLookupRecord[0].glyphSequenceIndex = 0
      `${lookupIndex.toString(16).padStart(4, '0')}`, // substLookupRecord[0].lookupListIndex

      // Coverage Format 1 (offset 16 from subtable start = byte 24 overall)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      `${inputGlyphId.toString(16).padStart(4, '0')}`, // glyphId
    );
  }

  it('consolidates two extension-wrapped Type 6 subtables with first-match priority', () => {
    // Rule 1: glyph 65 → apply lookup 0
    // Rule 2: glyph 66 → apply lookup 1
    const subtableData = [buildExtensionWrappedChainingRule(65, 0), buildExtensionWrappedChainingRule(66, 1)];
    const lookupTable: LookupTable = {
      lookupType: 7,
      lookupFlag: 0,
      subTableCount: 2,
      getSubTableData: (i: number) => subtableData[i],
    };

    const subtables = readAllGsubSubtables(lookupTable);

    // Both rules should be consolidated into a single chaining context subtable
    expect(subtables).toHaveLength(1);
    expect(subtables[0]).toBeInstanceOf(GsubChainingContextSubstSubtable);

    // Verify first rule matches glyph 65
    const lookupCalls: { lookupIndex: number; targetIndex: number }[] = [];
    const mockApplyLookup = (lookupIndex: number, _run: GlyphRun, targetIndex: number) => {
      lookupCalls.push({ lookupIndex, targetIndex });
    };
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 65, codePoints: [65], advance: 500 }],
    };
    subtables[0].applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);
    expect(lookupCalls).toEqual([{ lookupIndex: 0, targetIndex: 0 }]);

    // Verify second rule matches glyph 66
    lookupCalls.length = 0;
    const glyphRun2: GlyphRun = {
      glyphs: [{ glyphId: 66, codePoints: [66], advance: 500 }],
    };
    subtables[0].applyAtIndex(glyphRun2, 0, () => 500, undefined, mockApplyLookup);
    expect(lookupCalls).toEqual([{ lookupIndex: 1, targetIndex: 0 }]);
  });
});

function createMockGdef(
  glyphClasses: Record<number, number>,
  markAttachClasses?: Record<number, number>,
  markGlyphSets?: Record<number, Set<number>>,
): GdefTable {
  return {
    getGlyphClass: (glyphId: number) => glyphClasses[glyphId] ?? 0,
    getMarkAttachClass: (glyphId: number) => markAttachClasses?.[glyphId] ?? 0,
    isMarkInSet: (glyphId: number, setIndex: number) => markGlyphSets?.[setIndex]?.has(glyphId) ?? false,
  } as unknown as GdefTable;
}
