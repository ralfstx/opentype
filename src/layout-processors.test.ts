import { describe, expect, it } from 'vitest';

import { type GlyphRun } from './glyph-run.ts';
import { createSkipFn } from './layout-processors.ts';
import { LookupFlags, type LookupTable } from './tables/common/lookup-list.ts';
import { type GdefTable, GlyphClass } from './tables/gdef.ts';
import { GposSinglePosSubtable } from './tables/gpos.ts';
import {
  GsubAlternateSubstSubtable,
  GsubChainingContextSubstSubtable,
  GsubContextSubstSubtable,
  GsubLigatureSubstSubtable,
  GsubMultipleSubstSubtable,
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

describe('GsubMultipleSubstSubtable', () => {
  // Multiple substitution: glyph 65 (ﬁ ligature) → glyphs 66, 67 (f, i)
  // Layout:
  //   0: header (8 bytes: format + coverageOffset + sequenceCount + 1 sequenceOffset)
  //   8: Sequence (6 bytes: substituteCount + 2 glyphIds)
  //  14: Coverage (6 bytes)
  function buildMultipleSubstData(): DataView {
    return fromHexString(
      // Subtable header (offset 0)
      '0001', // format = 1
      '000E', // coverageOffset = 14
      '0001', // sequenceCount = 1
      '0008', // sequenceOffsets[0] = 8
      // Sequence (offset 8)
      '0002', // substituteCount = 2
      '0042', // substituteGlyphIds[0] = 66
      '0043', // substituteGlyphIds[1] = 67
      // Coverage (offset 14)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '0041', // glyphId = 65
    );
  }

  it('reads a multiple substitution subtable', () => {
    const subtable = GsubMultipleSubstSubtable.read(buildMultipleSubstData());
    expect(subtable).toBeInstanceOf(GsubMultipleSubstSubtable);
  });

  it('replaces one glyph with multiple glyphs', () => {
    const subtable = GsubMultipleSubstSubtable.read(buildMultipleSubstData());
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 65, codePoints: [0xfb01], advance: 500 }],
    };

    subtable.applyAtIndex(glyphRun, 0, () => 600);

    expect(glyphRun.glyphs).toHaveLength(2);
    expect(glyphRun.glyphs[0].glyphId).toBe(66);
    expect(glyphRun.glyphs[0].codePoints).toEqual([0xfb01]);
    expect(glyphRun.glyphs[0].advance).toBe(600);
    expect(glyphRun.glyphs[1].glyphId).toBe(67);
    expect(glyphRun.glyphs[1].codePoints).toEqual([]);
    expect(glyphRun.glyphs[1].advance).toBe(600);
  });

  it('does not match uncovered glyphs', () => {
    const subtable = GsubMultipleSubstSubtable.read(buildMultipleSubstData());
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 99, codePoints: [99], advance: 500 }],
    };

    const matched = subtable.applyAtIndex(glyphRun, 0, () => 600);

    expect(matched).toBe(false);
    expect(glyphRun.glyphs).toHaveLength(1);
  });

  it('skips glyphs matched by the skip predicate', () => {
    const subtable = GsubMultipleSubstSubtable.read(buildMultipleSubstData());
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 65, codePoints: [0xfb01], advance: 500 }],
    };

    const matched = subtable.applyAtIndex(
      glyphRun,
      0,
      () => 600,
      (id) => id === 65,
    );

    expect(matched).toBe(false);
    expect(glyphRun.glyphs).toHaveLength(1);
  });

  it('handles deletion (empty sequence)', () => {
    const data = fromHexString(
      // Header (offset 0, 8 bytes)
      '0001', // format = 1
      '000A', // coverageOffset = 10
      '0001', // sequenceCount = 1
      '0008', // sequenceOffsets[0] = 8
      // Sequence (offset 8, 2 bytes)
      '0000', // substituteCount = 0
      // Coverage (offset 10)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '0041', // glyphId = 65
    );
    const subtable = GsubMultipleSubstSubtable.read(data);
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 65, codePoints: [65], advance: 500 },
        { glyphId: 66, codePoints: [66], advance: 600 },
      ],
    };

    subtable.applyAtIndex(glyphRun, 0, () => 0);

    expect(glyphRun.glyphs).toHaveLength(1);
    expect(glyphRun.glyphs[0].glyphId).toBe(66);
  });

  it('is dispatched via readGsubSubtable for lookupType 2', () => {
    const data = buildMultipleSubstData();
    const lookupTable: LookupTable = {
      lookupType: 2,
      lookupFlag: 0,
      subTableCount: 1,
      getSubTableData: () => data,
    };

    const subtable = readGsubSubtable(lookupTable, 0);

    expect(subtable).toBeInstanceOf(GsubMultipleSubstSubtable);
  });
});

describe('GsubAlternateSubstSubtable', () => {
  // Alternate substitution: glyph 65 → one of [66, 67, 68] (picks first: 66)
  // Layout:
  //   0: header (8 bytes: format + coverageOffset + alternateSetCount + 1 alternateSetOffset)
  //   8: AlternateSet (8 bytes: alternateCount + 3 glyphIds)
  //  16: Coverage (6 bytes)
  function buildAlternateSubstData(): DataView {
    return fromHexString(
      // Subtable header (offset 0)
      '0001', // format = 1
      '0010', // coverageOffset = 16
      '0001', // alternateSetCount = 1
      '0008', // alternateSetOffsets[0] = 8
      // AlternateSet (offset 8)
      '0003', // alternateCount = 3
      '0042', // alternateGlyphIds[0] = 66
      '0043', // alternateGlyphIds[1] = 67
      '0044', // alternateGlyphIds[2] = 68
      // Coverage (offset 16)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '0041', // glyphId = 65
    );
  }

  it('reads an alternate substitution subtable', () => {
    const subtable = GsubAlternateSubstSubtable.read(buildAlternateSubstData());
    expect(subtable).toBeInstanceOf(GsubAlternateSubstSubtable);
  });

  it('replaces glyph with the first alternate', () => {
    const subtable = GsubAlternateSubstSubtable.read(buildAlternateSubstData());
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 65, codePoints: [65], advance: 500 }],
    };

    subtable.applyAtIndex(glyphRun, 0, () => 600);

    expect(glyphRun.glyphs).toHaveLength(1);
    expect(glyphRun.glyphs[0].glyphId).toBe(66);
    expect(glyphRun.glyphs[0].codePoints).toEqual([65]);
    expect(glyphRun.glyphs[0].advance).toBe(600);
  });

  it('does not match uncovered glyphs', () => {
    const subtable = GsubAlternateSubstSubtable.read(buildAlternateSubstData());
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 99, codePoints: [99], advance: 500 }],
    };

    const matched = subtable.applyAtIndex(glyphRun, 0, () => 600);

    expect(matched).toBe(false);
    expect(glyphRun.glyphs[0].glyphId).toBe(99);
  });

  it('skips glyphs matched by the skip predicate', () => {
    const subtable = GsubAlternateSubstSubtable.read(buildAlternateSubstData());
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 65, codePoints: [65], advance: 500 }],
    };

    const matched = subtable.applyAtIndex(
      glyphRun,
      0,
      () => 600,
      (id) => id === 65,
    );

    expect(matched).toBe(false);
    expect(glyphRun.glyphs[0].glyphId).toBe(65);
  });

  it('is dispatched via readGsubSubtable for lookupType 3', () => {
    const data = buildAlternateSubstData();
    const lookupTable: LookupTable = {
      lookupType: 3,
      lookupFlag: 0,
      subTableCount: 1,
      getSubTableData: () => data,
    };

    const subtable = readGsubSubtable(lookupTable, 0);

    expect(subtable).toBeInstanceOf(GsubAlternateSubstSubtable);
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

describe('GsubContextSubstSubtable — Format 1 (glyph-based)', () => {
  // Format 1: coverage identifies first glyph, rule sets contain rules
  // with explicit glyph ID sequences.
  //
  // Rule: when glyph 10 is followed by glyph 20, apply lookup 5 to
  // the first glyph (sequence index 0).
  //
  // Layout:
  //   0: subtable header (8 bytes)
  //   8: RuleSet (4 bytes: count + 1 offset)
  //  12: Rule (10 bytes: glyphCount + substCount + 1 inputGlyphId + 1 record)
  //  22: Coverage (6 bytes)
  function buildFormat1Data(): DataView {
    return fromHexString(
      // Subtable header (offset 0)
      '0001', // format = 1
      '0016', // coverageOffset = 22
      '0001', // ruleSetCount = 1
      '0008', // ruleSetOffsets[0] = 8

      // RuleSet (offset 8, offsets relative to here)
      '0001', // ruleCount = 1
      '0004', // ruleOffsets[0] = 4

      // Rule (offset 12)
      '0002', // glyphCount = 2
      '0001', // substCount = 1
      '0014', // inputGlyphIds[0] = 20
      '0000', // substLookupRecord[0].glyphSequenceIndex = 0
      '0005', // substLookupRecord[0].lookupListIndex = 5

      // Coverage (offset 22)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '000A', // glyphId = 10
    );
  }

  it('reads and applies Format 1 rules', () => {
    const subtable = GsubContextSubstSubtable.read(buildFormat1Data());
    expect(subtable).toBeInstanceOf(GsubContextSubstSubtable);

    const lookupCalls: { lookupIndex: number; targetIndex: number }[] = [];
    const mockApplyLookup = (lookupIndex: number, _run: GlyphRun, targetIndex: number) => {
      lookupCalls.push({ lookupIndex, targetIndex });
    };
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(lookupCalls).toEqual([{ lookupIndex: 5, targetIndex: 0 }]);
  });

  it('binds each rule set to its coverage index', () => {
    // Coverage: glyph 10 (index 0), glyph 30 (index 1)
    // RuleSet 0 (for glyph 10): glyph 10 + glyph 20 → lookup 5
    // RuleSet 1 (for glyph 30): glyph 30 + glyph 40 → lookup 9
    //
    // Layout:
    //   0: header (10 bytes: format + coverageOffset + ruleSetCount + 2 offsets)
    //  10: RuleSet 0 (4 bytes)
    //  14: Rule 0 (10 bytes)
    //  24: RuleSet 1 (4 bytes)
    //  28: Rule 1 (10 bytes)
    //  38: Coverage (8 bytes)
    const data = fromHexString(
      // Header (offset 0)
      '0001', // format = 1
      '0026', // coverageOffset = 38
      '0002', // ruleSetCount = 2
      '000A', // ruleSetOffsets[0] = 10
      '0018', // ruleSetOffsets[1] = 24

      // RuleSet 0 (offset 10)
      '0001', // ruleCount = 1
      '0004', // ruleOffsets[0] = 4

      // Rule 0 (offset 14): glyph 10 + glyph 20 → lookup 5
      '0002', // glyphCount = 2
      '0001', // substCount = 1
      '0014', // inputGlyphIds[0] = 20
      '0000', // glyphSequenceIndex = 0
      '0005', // lookupListIndex = 5

      // RuleSet 1 (offset 24)
      '0001', // ruleCount = 1
      '0004', // ruleOffsets[0] = 4

      // Rule 1 (offset 28): glyph 30 + glyph 40 → lookup 9
      '0002', // glyphCount = 2
      '0001', // substCount = 1
      '0028', // inputGlyphIds[0] = 40
      '0000', // glyphSequenceIndex = 0
      '0009', // lookupListIndex = 9

      // Coverage (offset 38)
      '0001', // format 1
      '0002', // glyphCount = 2
      '000A', // glyphId = 10 (index 0)
      '001E', // glyphId = 30 (index 1)
    );
    const subtable = GsubContextSubstSubtable.read(data)!;

    // Glyph 10 followed by 20 should match RuleSet 0 → lookup 5
    const calls1: { lookupIndex: number }[] = [];
    const run1: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
      ],
    };
    subtable.applyAtIndex(
      run1,
      0,
      () => 500,
      undefined,
      (li, _r, _i) => calls1.push({ lookupIndex: li }),
    );
    expect(calls1).toEqual([{ lookupIndex: 5 }]);

    // Glyph 10 followed by 40 should NOT match — RuleSet 0 expects 20,
    // and RuleSet 1 must not fire for glyph 10 (wrong coverage index)
    const calls2: { lookupIndex: number }[] = [];
    const run2: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 40, codePoints: [40], advance: 500 },
      ],
    };
    const matched = subtable.applyAtIndex(
      run2,
      0,
      () => 500,
      undefined,
      (li, _r, _i) => calls2.push({ lookupIndex: li }),
    );
    expect(matched).toBe(false);
    expect(calls2).toEqual([]);
  });

  it('does not match when second glyph differs', () => {
    const subtable = GsubContextSubstSubtable.read(buildFormat1Data());

    const lookupCalls: { lookupIndex: number; targetIndex: number }[] = [];
    const mockApplyLookup = (lookupIndex: number, _run: GlyphRun, targetIndex: number) => {
      lookupCalls.push({ lookupIndex, targetIndex });
    };
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 99, codePoints: [99], advance: 500 },
      ],
    };

    const matched = subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(matched).toBe(false);
    expect(lookupCalls).toEqual([]);
  });
});

describe('GsubContextSubstSubtable — Format 2 (class-based)', () => {
  // Format 2: coverage identifies first glyph, ClassDef assigns classes,
  // rule sets indexed by class of the first glyph.
  //
  // ClassDef: glyph 10 → class 1, glyph 20 → class 2
  // Rule: class 1 followed by class 2 → apply lookup 7 to sequence index 0
  //
  // Layout:
  //   0: subtable header (10 bytes)
  //  10: ClassSet[0] = NULL (class 0 has no rules)
  //  12: ClassSet[1] offset (class 1 has rules)
  //  14: ClassSet[2] = NULL
  //  16: ClassSet (4 bytes: count + 1 offset)
  //  20: ClassRule (10 bytes)
  //  30: Coverage (6 bytes)
  //  36: ClassDef (12 bytes: format 2 with 2 range records)
  //  Byte layout:
  //   0: format(2) + coverageOffset(2) + classDefOffset(2) + classSetCount(2) = 8
  //   8: classSetOffsets[0..2] = 6 bytes                                       = 14
  //  14: ClassSet: ruleCount(2) + ruleOffset(2)                                = 18
  //  18: ClassRule: glyphCount(2) + substCount(2) + classId(2) + record(4)     = 28
  //  28: Coverage: format(2) + count(2) + glyph(2) + glyph(2)                 = 36
  //  36: ClassDef: format(2) + rangeCount(2) + 2×range(6)                     = 52
  function buildFormat2Data(): DataView {
    return fromHexString(
      // Subtable header (offset 0)
      '0002', // format = 2
      '001C', // coverageOffset = 28
      '0024', // classDefOffset = 36
      '0003', // classSetCount = 3
      '0000', // classSetOffsets[0] = 0 (NULL, class 0)
      '000E', // classSetOffsets[1] = 14 (class 1)
      '0000', // classSetOffsets[2] = 0 (NULL, class 2)

      // ClassSet for class 1 (offset 14, offsets relative to here)
      '0001', // ruleCount = 1
      '0004', // ruleOffsets[0] = 4

      // ClassRule (offset 18)
      '0002', // glyphCount = 2
      '0001', // substCount = 1
      '0002', // inputClassIds[0] = class 2
      '0000', // substLookupRecord[0].glyphSequenceIndex = 0
      '0007', // substLookupRecord[0].lookupListIndex = 7

      // Coverage (offset 28)
      '0001', // coverage format 1
      '0002', // glyphCount = 2
      '000A', // glyphId = 10
      '0014', // glyphId = 20

      // ClassDef (offset 36) — format 2 (range-based)
      '0002', // format = 2
      '0002', // classRangeCount = 2
      '000A', // range[0].start = 10
      '000A', // range[0].end = 10
      '0001', // range[0].class = 1
      '0014', // range[1].start = 20
      '0014', // range[1].end = 20
      '0002', // range[1].class = 2
    );
  }

  it('reads and applies Format 2 rules', () => {
    const subtable = GsubContextSubstSubtable.read(buildFormat2Data());
    expect(subtable).toBeInstanceOf(GsubContextSubstSubtable);

    const lookupCalls: { lookupIndex: number; targetIndex: number }[] = [];
    const mockApplyLookup = (lookupIndex: number, _run: GlyphRun, targetIndex: number) => {
      lookupCalls.push({ lookupIndex, targetIndex });
    };
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(lookupCalls).toEqual([{ lookupIndex: 7, targetIndex: 0 }]);
  });

  it('does not match when first glyph is covered but wrong class', () => {
    const subtable = GsubContextSubstSubtable.read(buildFormat2Data());

    const lookupCalls: { lookupIndex: number; targetIndex: number }[] = [];
    const mockApplyLookup = (lookupIndex: number, _run: GlyphRun, targetIndex: number) => {
      lookupCalls.push({ lookupIndex, targetIndex });
    };
    // Glyph 20 is covered but is class 2, not class 1 — no rule set for class 2
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 20, codePoints: [20], advance: 500 },
        { glyphId: 10, codePoints: [10], advance: 500 },
      ],
    };

    const matched = subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(matched).toBe(false);
    expect(lookupCalls).toEqual([]);
  });
});

describe('GsubContextSubstSubtable — index drift after glyph insertion', () => {
  // Context Format 1: 3-glyph input [10, 20, 30] with two subst records:
  //   record 0: sequence index 0 → lookup 0 (will insert a glyph, expanding the array)
  //   record 1: sequence index 2 → lookup 1 (must target the shifted position)
  function buildContextWith2Records(): DataView {
    return fromHexString(
      // Subtable header (offset 0)
      '0001', // format = 1
      '001C', // coverageOffset = 28
      '0001', // ruleSetCount = 1
      '0008', // ruleSetOffsets[0] = 8

      // RuleSet (offset 8, offsets relative to here)
      '0001', // ruleCount = 1
      '0004', // ruleOffsets[0] = 4

      // Rule (offset 12)
      '0003', // glyphCount = 3
      '0002', // substCount = 2
      '0014', // inputGlyphIds[0] = 20
      '001E', // inputGlyphIds[1] = 30
      '0000', // substLookupRecord[0].glyphSequenceIndex = 0
      '0000', // substLookupRecord[0].lookupListIndex = 0
      '0002', // substLookupRecord[1].glyphSequenceIndex = 2
      '0001', // substLookupRecord[1].lookupListIndex = 1

      // Coverage (offset 28)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '000A', // glyphId = 10
    );
  }

  it('adjusts later target indices when an earlier lookup inserts glyphs', () => {
    const subtable = GsubContextSubstSubtable.read(buildContextWith2Records());

    // Track what indices lookup 1 receives
    const lookup1Indices: number[] = [];
    const mockApplyLookup = (lookupIndex: number, run: GlyphRun, targetIndex: number) => {
      if (lookupIndex === 0) {
        // Simulate a multiple substitution: glyph at targetIndex expands into 2 glyphs
        const orig = run.glyphs[targetIndex];
        run.glyphs.splice(targetIndex, 1, { ...orig, glyphId: 100 }, { glyphId: 101, codePoints: [], advance: 500 });
      }
      if (lookupIndex === 1) {
        lookup1Indices.push(targetIndex);
      }
    };

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
        { glyphId: 30, codePoints: [30], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    // After lookup 0: glyphs are [100, 101, 20, 30] — glyph 30 moved from index 2 to index 3
    expect(glyphRun.glyphs).toHaveLength(4);
    // Lookup 1 should have been called with the adjusted index (3, not 2)
    expect(lookup1Indices).toEqual([3]);
    expect(glyphRun.glyphs[lookup1Indices[0]].glyphId).toBe(30);
  });

  it('adjusts later target indices when an earlier lookup deletes a glyph', () => {
    const subtable = GsubContextSubstSubtable.read(buildContextWith2Records());

    const lookup1Indices: number[] = [];
    const mockApplyLookup = (lookupIndex: number, run: GlyphRun, targetIndex: number) => {
      if (lookupIndex === 0) {
        // Simulate deletion: remove the glyph at targetIndex
        run.glyphs.splice(targetIndex, 1);
      }
      if (lookupIndex === 1) {
        lookup1Indices.push(targetIndex);
      }
    };

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
        { glyphId: 30, codePoints: [30], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    // After lookup 0: glyphs are [20, 30] — glyph 30 moved from index 2 to index 1
    expect(glyphRun.glyphs).toHaveLength(2);
    expect(lookup1Indices).toEqual([1]);
    expect(glyphRun.glyphs[lookup1Indices[0]].glyphId).toBe(30);
  });
});

describe('GsubChainingContextSubstSubtable — index drift after glyph insertion', () => {
  // Chaining Context Format 3: input coverage matches [10, 20, 30],
  // no backtrack/lookahead, two subst records targeting indices 0 and 2.
  function buildChainingContextWith2Records(): DataView {
    return fromHexString(
      // Subtable header (offset 0)
      '0003', // format = 3
      '0000', // backtrackGlyphCount = 0
      '0003', // inputGlyphCount = 3
      '0018', // inputCoverageOffsets[0] = 24
      '001E', // inputCoverageOffsets[1] = 30
      '0024', // inputCoverageOffsets[2] = 36
      '0000', // lookaheadGlyphCount = 0
      '0002', // substCount = 2
      '0000', // substLookupRecord[0].glyphSequenceIndex = 0
      '0000', // substLookupRecord[0].lookupListIndex = 0
      '0002', // substLookupRecord[1].glyphSequenceIndex = 2
      '0001', // substLookupRecord[1].lookupListIndex = 1

      // Coverage 0 (offset 24): matches glyph 10
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '000A', // glyphId = 10

      // Coverage 1 (offset 30): matches glyph 20
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '0014', // glyphId = 20

      // Coverage 2 (offset 36): matches glyph 30
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '001E', // glyphId = 30
    );
  }

  it('adjusts later target indices when an earlier lookup inserts glyphs', () => {
    const subtable = GsubChainingContextSubstSubtable.read(buildChainingContextWith2Records());

    const lookup1Indices: number[] = [];
    const mockApplyLookup = (lookupIndex: number, run: GlyphRun, targetIndex: number) => {
      if (lookupIndex === 0) {
        const orig = run.glyphs[targetIndex];
        run.glyphs.splice(targetIndex, 1, { ...orig, glyphId: 100 }, { glyphId: 101, codePoints: [], advance: 500 });
      }
      if (lookupIndex === 1) {
        lookup1Indices.push(targetIndex);
      }
    };

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
        { glyphId: 30, codePoints: [30], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(glyphRun.glyphs).toHaveLength(4);
    expect(lookup1Indices).toEqual([3]);
    expect(glyphRun.glyphs[lookup1Indices[0]].glyphId).toBe(30);
  });

  it('adjusts later target indices when an earlier lookup deletes a glyph', () => {
    const subtable = GsubChainingContextSubstSubtable.read(buildChainingContextWith2Records());

    const lookup1Indices: number[] = [];
    const mockApplyLookup = (lookupIndex: number, run: GlyphRun, targetIndex: number) => {
      if (lookupIndex === 0) {
        run.glyphs.splice(targetIndex, 1);
      }
      if (lookupIndex === 1) {
        lookup1Indices.push(targetIndex);
      }
    };

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
        { glyphId: 30, codePoints: [30], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(glyphRun.glyphs).toHaveLength(2);
    expect(lookup1Indices).toEqual([1]);
    expect(glyphRun.glyphs[lookup1Indices[0]].glyphId).toBe(30);
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
