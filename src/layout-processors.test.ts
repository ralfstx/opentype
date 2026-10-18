import { describe, expect, it } from 'vitest';

import { type GlyphRun } from './glyph-run.ts';
import { createSkipFn, GposProcessor, GsubProcessor } from './layout-processors.ts';
import { LookupFlags, type LookupTable } from './tables/common/lookup-list.ts';
import { type GdefTable, GlyphClass } from './tables/gdef.ts';
import { GposSinglePosSubtable, GposTable } from './tables/gpos.ts';
import {
  applyGsubSubtablesAtIndex,
  GsubAlternateSubstSubtable,
  GsubChainingContextSubstSubtable,
  GsubContextSubstSubtable,
  GsubLigatureSubstSubtable,
  GsubMultipleSubstSubtable,
  GsubSingleSubstSubtable,
  GsubTable,
  readGsubSubtable,
} from './tables/gsub.ts';
import { type HmtxTable } from './tables/hmtx.ts';
import { fromHexString } from './test-utils.ts';

describe('GsubProcessor', () => {
  const hmtxTable = { getMetric: () => ({ advanceWidth: 500, leftSideBearing: 0 }) } as unknown as HmtxTable;

  // Single substitution (type 1, format 2) of one glyph
  const singleSubst = (fromGlyphId: number, toGlyphId: number) => [
    '0002', // format = 2
    '0008', // coverageOffset = 8
    '0001', // glyphCount = 1
    toGlyphId.toString(16).padStart(4, '0'), // substituteGlyphIds[0]
    '0001 0001', // Coverage: format 1, glyphCount = 1
    fromGlyphId.toString(16).padStart(4, '0'), // glyphId
  ];

  it('applies the first subtable that matches at each position', () => {
    // One lookup with two subtables: 10 → 20 and 20 → 30. The second
    // subtable must not be applied to the result of the first one.
    const processor = new GsubProcessor(
      buildGsubTable([{ type: 1, subtables: [singleSubst(10, 20), singleSubst(20, 30)] }]),
      hmtxTable,
    );
    const glyphRun = createGlyphRun([10, 20]);

    processor.apply(glyphRun, ['test'], {});

    expect(glyphRun.glyphs.map((glyph) => glyph.glyphId)).toEqual([20, 30]);
  });

  it('continues after the input sequence of a contextual match', () => {
    // Lookup 0: context substitution (type 5, format 3), input [10] [10],
    // applies lookup 1 to the first input glyph.
    // Lookup 1: single substitution 10 → 11.
    const processor = new GsubProcessor(
      buildGsubTable([
        {
          type: 5,
          subtables: [
            [
              '0003', // format = 3
              '0002', // glyphCount = 2
              '0001', // seqLookupCount = 1
              '000E', // coverageOffsets[0] = 14
              '000E', // coverageOffsets[1] = 14
              '0000', // seqLookupRecord[0].sequenceIndex = 0
              '0001', // seqLookupRecord[0].lookupListIndex = 1
              '0001 0001 000A', // Coverage (offset 14): glyph 10
            ],
          ],
        },
        { type: 1, subtables: [singleSubst(10, 11)] },
      ]),
      hmtxTable,
    );
    const glyphRun = createGlyphRun([10, 10, 10]);

    processor.apply(glyphRun, ['test'], {});

    // The second match would start at glyph 1, inside the first match
    expect(glyphRun.glyphs.map((glyph) => glyph.glyphId)).toEqual([11, 10, 10]);
  });

  it('limits the number of nested lookups', () => {
    // Lookup 0: context substitution (type 5, format 3), input [10],
    // applies itself 16 times to the input glyph. Without a limit, this
    // expands to 16^8 nested lookups before reaching the nesting limit.
    const selfReferences = Array.from({ length: 16 }, () => '0000 0000');
    const processor = new GsubProcessor(
      buildGsubTable([
        {
          type: 5,
          subtables: [
            [
              '0003', // format = 3
              '0001', // glyphCount = 1
              '0010', // seqLookupCount = 16
              '0048', // coverageOffsets[0] = 72
              ...selfReferences, // sequenceIndex = 0, lookupListIndex = 0
              '0001 0001 000A', // Coverage (offset 72): glyph 10
            ],
          ],
        },
      ]),
      hmtxTable,
    );
    const glyphRun = createGlyphRun([10]);

    expect(() => processor.apply(glyphRun, ['test'], {})).not.toThrow();
  });
});

describe('GposProcessor', () => {
  // GPOS table with a `kern` feature referencing one lookup (type 1) with
  // two single pos subtables: the first one covers glyph 10 and sets
  // xAdvance -10, the second one covers glyphs 10 and 11 and sets -20.
  const gposTable = GposTable.read(
    fromHexString(
      // GPOS header (offset 0)
      '0001', // majorVersion = 1
      '0000', // minorVersion = 0
      '000A', // scriptListOffset = 10
      '001E', // featureListOffset = 30
      '002C', // lookupListOffset = 44

      // ScriptList (offset 10)
      '0001', // scriptCount = 1
      '44464C54', // scriptTag = 'DFLT'
      '0008', // scriptOffset = 8

      // Script (offset 18)
      '0004', // defaultLangSysOffset = 4
      '0000', // langSysCount = 0

      // LangSys (offset 22)
      '0000', // lookupOrderOffset = NULL
      'FFFF', // requiredFeatureIndex = none
      '0001', // featureIndexCount = 1
      '0000', // featureIndices[0] = 0

      // FeatureList (offset 30)
      '0001', // featureCount = 1
      '6B65726E', // featureTag = 'kern'
      '0008', // featureOffset = 8

      // Feature (offset 38)
      '0000', // featureParamsOffset = NULL
      '0001', // lookupIndexCount = 1
      '0000', // lookupListIndices[0] = 0

      // LookupList (offset 44)
      '0001', // lookupCount = 1
      '0004', // lookupOffsets[0] = 4

      // Lookup (offset 48, subtable offsets relative to here)
      '0001', // lookupType = 1
      '0000', // lookupFlag = 0
      '0002', // subTableCount = 2
      '000A', // subtableOffsets[0] = 10
      '0018', // subtableOffsets[1] = 24

      // Subtable A (offset 58): single pos format 1
      '0001', // format = 1
      '0008', // coverageOffset = 8
      '0004', // valueFormat = X_ADVANCE
      'FFF6', // xAdvance = -10
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '000A', // glyphId = 10

      // Subtable B (offset 72): single pos format 1
      '0001', // format = 1
      '0008', // coverageOffset = 8
      '0004', // valueFormat = X_ADVANCE
      'FFEC', // xAdvance = -20
      '0001', // coverage format 1
      '0002', // glyphCount = 2
      '000A', // glyphId = 10
      '000B', // glyphId = 11
    ),
  );

  it('applies the first subtable that matches at each position', () => {
    const processor = new GposProcessor(gposTable);
    const glyphRun = createGlyphRun([10, 11]);

    processor.apply(glyphRun, ['kern'], {});

    expect(glyphRun.glyphs[0].advanceAdjust).toBe(-10); // both match, A wins
    expect(glyphRun.glyphs[1].advanceAdjust).toBe(-20); // only B matches
  });

  it('continues after the input sequence of a contextual match', () => {
    // Lookup 0: context positioning (type 7, format 3), input [10] [10],
    // applies lookup 1 to the second input glyph.
    // Lookup 1: single pos (type 1, format 1), xAdvance = -10 for glyph 10.
    const processor = new GposProcessor(
      buildGposTable([
        {
          type: 7,
          subtable: [
            '0003', // format = 3
            '0002', // glyphCount = 2
            '0001', // seqLookupCount = 1
            '000E', // coverageOffsets[0] = 14
            '000E', // coverageOffsets[1] = 14
            '0001', // seqLookupRecord[0].sequenceIndex = 1
            '0001', // seqLookupRecord[0].lookupListIndex = 1
            '0001',
            '0001',
            '000A', // Coverage (offset 14): glyph 10
          ],
        },
        {
          type: 1,
          subtable: [
            '0001', // format = 1
            '0008', // coverageOffset = 8
            '0004', // valueFormat = X_ADVANCE
            'FFF6', // xAdvance = -10
            '0001',
            '0001',
            '000A', // Coverage (offset 8): glyph 10
          ],
        },
      ]),
    );
    const glyphRun = createGlyphRun([10, 10, 10]);

    processor.apply(glyphRun, ['kern'], {});

    // The second match would start at glyph 1, inside the first match
    expect(glyphRun.glyphs.map((glyph) => glyph.advanceAdjust)).toEqual([undefined, -10, undefined]);
  });

  it('limits the number of nested lookups', () => {
    // Lookup 0: context positioning (type 7, format 3), input [10],
    // applies itself 16 times to the input glyph. Without a limit, this
    // expands to 16^8 nested lookups before reaching the nesting limit.
    const selfReferences = Array.from({ length: 16 }, () => '0000' + '0000');
    const processor = new GposProcessor(
      buildGposTable([
        {
          type: 7,
          subtable: [
            '0003', // format = 3
            '0001', // glyphCount = 1
            '0010', // seqLookupCount = 16
            '0048', // coverageOffsets[0] = 72
            ...selfReferences, // sequenceIndex = 0, lookupListIndex = 0
            '0001',
            '0001',
            '000A', // Coverage (offset 72): glyph 10
          ],
        },
      ]),
    );
    const glyphRun = createGlyphRun([10]);

    expect(() => processor.apply(glyphRun, ['kern'], {})).not.toThrow();
  });
});

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

    subtable.applyToGlyphRun(glyphRun, { skip });

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

    const next = subtable.applyAtIndex(glyphRun, 0, () => 600);

    expect(next).toBeUndefined();
    expect(glyphRun.glyphs).toHaveLength(1);
  });

  it('skips glyphs matched by the skip predicate', () => {
    const subtable = GsubMultipleSubstSubtable.read(buildMultipleSubstData());
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 65, codePoints: [0xfb01], advance: 500 }],
    };

    const next = subtable.applyAtIndex(
      glyphRun,
      0,
      () => 600,
      (id) => id === 65,
    );

    expect(next).toBeUndefined();
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

    const next = subtable.applyAtIndex(glyphRun, 0, () => 600);

    expect(next).toBeUndefined();
    expect(glyphRun.glyphs[0].glyphId).toBe(99);
  });

  it('skips glyphs matched by the skip predicate', () => {
    const subtable = GsubAlternateSubstSubtable.read(buildAlternateSubstData());
    const glyphRun: GlyphRun = {
      glyphs: [{ glyphId: 65, codePoints: [65], advance: 500 }],
    };

    const next = subtable.applyAtIndex(
      glyphRun,
      0,
      () => 600,
      (id) => id === 65,
    );

    expect(next).toBeUndefined();
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

describe('readGsubSubtable — Extension-wrapped Type 6', () => {
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

  it('unwraps extension subtables, the first matching subtable applies', () => {
    // Subtable 0: glyph 65 → apply lookup 0
    // Subtable 1: glyph 65 → apply lookup 1 (shadowed by subtable 0)
    // Subtable 2: glyph 66 → apply lookup 2
    const subtableData = [
      buildExtensionWrappedChainingRule(65, 0),
      buildExtensionWrappedChainingRule(65, 1),
      buildExtensionWrappedChainingRule(66, 2),
    ];
    const lookupTable: LookupTable = {
      lookupType: 7,
      lookupFlag: 0,
      subTableCount: 3,
      getSubTableData: (i: number) => subtableData[i],
    };
    const subtables = [0, 1, 2].map((i) => readGsubSubtable(lookupTable, i)!);
    const lookupCalls: number[] = [];
    const glyphRun = createGlyphRun([65, 66]);

    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      applyGsubSubtablesAtIndex(
        subtables,
        glyphRun,
        i,
        () => 500,
        undefined,
        (lookupIndex) => lookupCalls.push(lookupIndex),
      );
    }

    expect(subtables[0]).toBeInstanceOf(GsubChainingContextSubstSubtable);
    expect(lookupCalls).toEqual([0, 2]);
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
    const next = subtable.applyAtIndex(
      run2,
      0,
      () => 500,
      undefined,
      (li, _r, _i) => calls2.push({ lookupIndex: li }),
    );
    expect(next).toBeUndefined();
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

    const next = subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(next).toBeUndefined();
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

    const next = subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(next).toBeUndefined();
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

describe('GsubChainingContextSubstSubtable — Format 1 (glyph-based)', () => {
  // Rule: glyph 10 + glyph 20, preceded by glyph 5 and followed by
  // glyph 30, applies lookup 7 to the second input glyph.
  //
  // Layout:
  //   0: subtable header (8 bytes)
  //   8: ChainSubRuleSet (4 bytes)
  //  12: ChainSubRule (18 bytes)
  //  30: Coverage (6 bytes)
  const data = fromHexString(
    // Subtable header (offset 0)
    '0001', // format = 1
    '001E', // coverageOffset = 30
    '0001', // chainSubRuleSetCount = 1
    '0008', // chainSubRuleSetOffsets[0] = 8

    // ChainSubRuleSet (offset 8)
    '0001', // chainSubRuleCount = 1
    '0004', // chainSubRuleOffsets[0] = 4

    // ChainSubRule (offset 12)
    '0001', // backtrackGlyphCount = 1
    '0005', // backtrackSequence[0] = 5
    '0002', // inputGlyphCount = 2
    '0014', // inputSequence[0] = 20
    '0001', // lookaheadGlyphCount = 1
    '001E', // lookaheadSequence[0] = 30
    '0001', // substCount = 1
    '0001', // substLookupRecord[0].glyphSequenceIndex = 1
    '0007', // substLookupRecord[0].lookupListIndex = 7

    // Coverage (offset 30)
    '0001', // coverage format 1
    '0001', // glyphCount = 1
    '000A', // glyphId = 10
  );

  it('applies the lookup when all contexts match', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const calls: { lookupIndex: number; targetIndex: number }[] = [];
    const glyphRun = createGlyphRun([5, 10, 20, 30]);

    const next = subtable.applyAtIndex(
      glyphRun,
      1,
      () => 500,
      undefined,
      (lookupIndex, _run, targetIndex) => {
        calls.push({ lookupIndex, targetIndex });
      },
    );

    expect(next).toBe(3); // position after the input sequence
    expect(calls).toEqual([{ lookupIndex: 7, targetIndex: 2 }]);
  });

  it('matches contexts across skipped glyphs', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const calls: number[] = [];
    const glyphRun = createGlyphRun([5, 99, 10, 99, 20, 99, 30]);

    const next = subtable.applyAtIndex(
      glyphRun,
      2,
      () => 500,
      (glyphId) => glyphId === 99,
      (_lookupIndex, _run, targetIndex) => calls.push(targetIndex),
    );

    expect(next).toBe(5); // position after the input sequence
    expect(calls).toEqual([4]);
  });

  it('does not match when the backtrack glyph differs', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const glyphRun = createGlyphRun([6, 10, 20, 30]);

    const next = subtable.applyAtIndex(
      glyphRun,
      1,
      () => 500,
      undefined,
      () => {},
    );

    expect(next).toBeUndefined();
  });

  it('does not match when the lookahead glyph is missing', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const glyphRun = createGlyphRun([5, 10, 20]);

    const next = subtable.applyAtIndex(
      glyphRun,
      1,
      () => 500,
      undefined,
      () => {},
    );

    expect(next).toBeUndefined();
  });
});

describe('GsubChainingContextSubstSubtable — rule order and backtrack order', () => {
  // Format 1 rule set with two rules for the input sequence 10 20:
  // - Rule A: backtrack [5, 6], i.e. glyph 5 immediately before the input
  //   and glyph 6 before that, applies lookup 7.
  // - Rule B: no backtrack, applies lookup 8.
  //
  // Layout:
  //   0: subtable header (8 bytes)
  //   8: ChainSubRuleSet (6 bytes)
  //  14: ChainSubRule A (18 bytes)
  //  32: ChainSubRule B (14 bytes)
  //  46: Coverage (6 bytes)
  const data = fromHexString(
    // Subtable header (offset 0)
    '0001', // format = 1
    '002E', // coverageOffset = 46
    '0001', // chainSubRuleSetCount = 1
    '0008', // chainSubRuleSetOffsets[0] = 8

    // ChainSubRuleSet (offset 8)
    '0002', // chainSubRuleCount = 2
    '0006', // chainSubRuleOffsets[0] = 6
    '0018', // chainSubRuleOffsets[1] = 24

    // ChainSubRule A (offset 14)
    '0002', // backtrackGlyphCount = 2
    '0005', // backtrackSequence[0] = 5
    '0006', // backtrackSequence[1] = 6
    '0002', // inputGlyphCount = 2
    '0014', // inputSequence[0] = 20
    '0000', // lookaheadGlyphCount = 0
    '0001', // substCount = 1
    '0000', // substLookupRecord[0].glyphSequenceIndex = 0
    '0007', // substLookupRecord[0].lookupListIndex = 7

    // ChainSubRule B (offset 32)
    '0000', // backtrackGlyphCount = 0
    '0002', // inputGlyphCount = 2
    '0014', // inputSequence[0] = 20
    '0000', // lookaheadGlyphCount = 0
    '0001', // substCount = 1
    '0000', // substLookupRecord[0].glyphSequenceIndex = 0
    '0008', // substLookupRecord[0].lookupListIndex = 8

    // Coverage (offset 46)
    '0001', // coverage format 1
    '0001', // glyphCount = 1
    '000A', // glyphId = 10
  );

  it('applies only the first matching rule', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const calls: number[] = [];
    const glyphRun = createGlyphRun([6, 5, 10, 20]);

    subtable.applyAtIndex(
      glyphRun,
      2,
      () => 500,
      undefined,
      (lookupIndex) => calls.push(lookupIndex),
    );

    expect(calls).toEqual([7]);
  });

  it('matches the backtrack sequence starting at the glyph before the input', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const calls: number[] = [];
    const glyphRun = createGlyphRun([5, 6, 10, 20]);

    subtable.applyAtIndex(
      glyphRun,
      2,
      () => 500,
      undefined,
      (lookupIndex) => calls.push(lookupIndex),
    );

    // Rule A does not match the reversed backtrack, so rule B applies
    expect(calls).toEqual([8]);
  });
});

describe('GsubChainingContextSubstSubtable — Format 2 (class-based)', () => {
  // Classes: input glyph 10 → 1, glyph 20 → 2; backtrack glyph 5 → 1;
  // lookahead glyph 30 → 1. All other glyphs are class 0.
  // Rule (class set 1): backtrack [1], input [1, 2], lookahead [1],
  // applies lookup 7 to the first input glyph.
  //
  // Layout:
  //   0: subtable header (16 bytes)
  //  16: ChainSubClassSet (4 bytes)
  //  20: ChainSubClassRule (18 bytes)
  //  38: Coverage (6 bytes)
  //  44: input ClassDef (16 bytes)
  //  60: backtrack ClassDef (10 bytes)
  //  70: lookahead ClassDef (10 bytes)
  const data = fromHexString(
    // Subtable header (offset 0)
    '0002', // format = 2
    '0026', // coverageOffset = 38
    '003C', // backtrackClassDefOffset = 60
    '002C', // inputClassDefOffset = 44
    '0046', // lookaheadClassDefOffset = 70
    '0002', // chainSubClassSetCount = 2
    '0000', // chainSubClassSetOffsets[0] = NULL
    '0010', // chainSubClassSetOffsets[1] = 16

    // ChainSubClassSet (offset 16)
    '0001', // chainSubClassRuleCount = 1
    '0004', // chainSubClassRuleOffsets[0] = 4

    // ChainSubClassRule (offset 20)
    '0001', // backtrackGlyphCount = 1
    '0001', // backtrackSequence[0] = class 1
    '0002', // inputGlyphCount = 2
    '0002', // inputSequence[0] = class 2
    '0001', // lookaheadGlyphCount = 1
    '0001', // lookaheadSequence[0] = class 1
    '0001', // substCount = 1
    '0000', // substLookupRecord[0].glyphSequenceIndex = 0
    '0007', // substLookupRecord[0].lookupListIndex = 7

    // Coverage (offset 38)
    '0001', // coverage format 1
    '0001', // glyphCount = 1
    '000A', // glyphId = 10

    // Input ClassDef (offset 44)
    '0002', // format 2
    '0002', // classRangeCount = 2
    '000A',
    '000A',
    '0001', // glyph 10 → class 1
    '0014',
    '0014',
    '0002', // glyph 20 → class 2

    // Backtrack ClassDef (offset 60)
    '0002', // format 2
    '0001', // classRangeCount = 1
    '0005',
    '0005',
    '0001', // glyph 5 → class 1

    // Lookahead ClassDef (offset 70)
    '0002', // format 2
    '0001', // classRangeCount = 1
    '001E',
    '001E',
    '0001', // glyph 30 → class 1
  );

  it('applies the lookup when all class contexts match', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const calls: { lookupIndex: number; targetIndex: number }[] = [];
    const glyphRun = createGlyphRun([5, 10, 20, 30]);

    const next = subtable.applyAtIndex(
      glyphRun,
      1,
      () => 500,
      undefined,
      (lookupIndex, _run, targetIndex) => {
        calls.push({ lookupIndex, targetIndex });
      },
    );

    expect(next).toBe(3); // position after the input sequence
    expect(calls).toEqual([{ lookupIndex: 7, targetIndex: 1 }]);
  });

  it('does not match when the backtrack glyph has class 0', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const glyphRun = createGlyphRun([99, 10, 20, 30]);

    const next = subtable.applyAtIndex(
      glyphRun,
      1,
      () => 500,
      undefined,
      () => {},
    );

    expect(next).toBeUndefined();
  });

  it('does not match when an input glyph has the wrong class', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const glyphRun = createGlyphRun([5, 10, 10, 30]);

    const next = subtable.applyAtIndex(
      glyphRun,
      1,
      () => 500,
      undefined,
      () => {},
    );

    expect(next).toBeUndefined();
  });

  it('does not match when the lookahead glyph has the wrong class', () => {
    const subtable = GsubChainingContextSubstSubtable.read(data)!;
    const glyphRun = createGlyphRun([5, 10, 20, 20]);

    const next = subtable.applyAtIndex(
      glyphRun,
      1,
      () => 500,
      undefined,
      () => {},
    );

    expect(next).toBeUndefined();
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

describe('GsubContextSubstSubtable — same sequence index after length change', () => {
  // Context Format 1: 2-glyph input [10, 20] with two subst records
  // both targeting sequence index 0. The first lookup deletes the glyph.
  function buildContextSameIndex(): DataView {
    return fromHexString(
      // Subtable header (offset 0)
      '0001', // format = 1
      '001A', // coverageOffset = 26
      '0001', // ruleSetCount = 1
      '0008', // ruleSetOffsets[0] = 8

      // RuleSet (offset 8, offsets relative to here)
      '0001', // ruleCount = 1
      '0004', // ruleOffsets[0] = 4

      // Rule (offset 12)
      '0002', // glyphCount = 2
      '0002', // substCount = 2
      '0014', // inputGlyphIds[0] = 20
      '0000', // substLookupRecord[0].glyphSequenceIndex = 0
      '0000', // substLookupRecord[0].lookupListIndex = 0
      '0000', // substLookupRecord[1].glyphSequenceIndex = 0
      '0001', // substLookupRecord[1].lookupListIndex = 1

      // Coverage (offset 26)
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '000A', // glyphId = 10
    );
  }

  it('skips second record when the first lookup deletes the glyph', () => {
    const subtable = GsubContextSubstSubtable.read(buildContextSameIndex());

    const lookupCalls: number[] = [];
    const mockApplyLookup = (lookupIndex: number, run: GlyphRun, targetIndex: number) => {
      lookupCalls.push(lookupIndex);
      if (lookupIndex === 0) {
        // Simulate deletion
        run.glyphs.splice(targetIndex, 1);
      }
    };

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    // Lookup 0 fires and deletes glyph 10. Lookup 1 must NOT fire —
    // the position is invalidated, so the second record is skipped.
    expect(lookupCalls).toEqual([0]);
    expect(glyphRun.glyphs).toHaveLength(1);
    expect(glyphRun.glyphs[0].glyphId).toBe(20);
  });

  it('skips second record when the first lookup expands the glyph', () => {
    const subtable = GsubContextSubstSubtable.read(buildContextSameIndex());

    const lookupCalls: number[] = [];
    const mockApplyLookup = (lookupIndex: number, run: GlyphRun, targetIndex: number) => {
      lookupCalls.push(lookupIndex);
      if (lookupIndex === 0) {
        // Simulate one-to-many expansion
        const orig = run.glyphs[targetIndex];
        run.glyphs.splice(targetIndex, 1, { ...orig, glyphId: 100 }, { glyphId: 101, codePoints: [], advance: 500 });
      }
    };

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    // Lookup 0 fires and expands glyph 10 into two glyphs. Lookup 1 must
    // NOT fire — the position is invalidated after any length change.
    expect(lookupCalls).toEqual([0]);
    expect(glyphRun.glyphs).toHaveLength(3);
  });
});

describe('GsubChainingContextSubstSubtable — same sequence index after length change', () => {
  // Chaining Context Format 3: input coverage matches [10, 20],
  // two subst records both targeting sequence index 0.
  function buildChainingContextSameIndex(): DataView {
    return fromHexString(
      // Subtable header (offset 0)
      '0003', // format = 3
      '0000', // backtrackGlyphCount = 0
      '0002', // inputGlyphCount = 2
      '0016', // inputCoverageOffsets[0] = 22
      '001C', // inputCoverageOffsets[1] = 28
      '0000', // lookaheadGlyphCount = 0
      '0002', // substCount = 2
      '0000', // substLookupRecord[0].glyphSequenceIndex = 0
      '0000', // substLookupRecord[0].lookupListIndex = 0
      '0000', // substLookupRecord[1].glyphSequenceIndex = 0
      '0001', // substLookupRecord[1].lookupListIndex = 1

      // Coverage 0 (offset 22): matches glyph 10
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '000A', // glyphId = 10

      // Coverage 1 (offset 28): matches glyph 20
      '0001', // coverage format 1
      '0001', // glyphCount = 1
      '0014', // glyphId = 20
    );
  }

  it('skips second record when the first lookup deletes the glyph', () => {
    const subtable = GsubChainingContextSubstSubtable.read(buildChainingContextSameIndex());

    const lookupCalls: number[] = [];
    const mockApplyLookup = (lookupIndex: number, run: GlyphRun, targetIndex: number) => {
      lookupCalls.push(lookupIndex);
      if (lookupIndex === 0) {
        run.glyphs.splice(targetIndex, 1);
      }
    };

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(lookupCalls).toEqual([0]);
    expect(glyphRun.glyphs).toHaveLength(1);
    expect(glyphRun.glyphs[0].glyphId).toBe(20);
  });

  it('skips second record when the first lookup expands the glyph', () => {
    const subtable = GsubChainingContextSubstSubtable.read(buildChainingContextSameIndex());

    const lookupCalls: number[] = [];
    const mockApplyLookup = (lookupIndex: number, run: GlyphRun, targetIndex: number) => {
      lookupCalls.push(lookupIndex);
      if (lookupIndex === 0) {
        const orig = run.glyphs[targetIndex];
        run.glyphs.splice(targetIndex, 1, { ...orig, glyphId: 100 }, { glyphId: 101, codePoints: [], advance: 500 });
      }
    };

    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [10], advance: 500 },
        { glyphId: 20, codePoints: [20], advance: 500 },
      ],
    };

    subtable!.applyAtIndex(glyphRun, 0, () => 500, undefined, mockApplyLookup);

    expect(lookupCalls).toEqual([0]);
    expect(glyphRun.glyphs).toHaveLength(3);
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

/**
 * Builds the data of a GSUB or GPOS table with a single feature for the
 * DFLT script that references the first of the given lookups.
 */
function buildLayoutTableData(featureTag: string, lookups: { type: number; subtables: string[][] }[]): DataView {
  const hex16 = (value: number) => value.toString(16).padStart(4, '0');
  const tagHex = [...featureTag].map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const lookupHexes = lookups.map(({ type, subtables }) => {
    const subtableHexes = subtables.map((subtable) => subtable.join('').replace(/\s/g, ''));
    // Lookup header: lookupType, lookupFlag, subTableCount, subtableOffsets
    const header = [hex16(type), '0000', hex16(subtables.length)];
    let offset = 6 + subtables.length * 2;
    for (const subtableHex of subtableHexes) {
      header.push(hex16(offset));
      offset += subtableHex.length / 2;
    }
    return [...header, ...subtableHexes].join('');
  });
  const lookupOffsets: string[] = [];
  let offset = 2 + lookups.length * 2;
  for (const lookupHex of lookupHexes) {
    lookupOffsets.push(hex16(offset));
    offset += lookupHex.length / 2;
  }
  return fromHexString(
    // Header: version 1.0, scriptList at 10, featureList at 30, lookupList at 44
    '0001 0000 000A 001E 002C',
    // ScriptList: 'DFLT' with a default LangSys referencing feature 0
    '0001 44464C54 0008 0004 0000 0000 FFFF 0001 0000',
    // FeatureList: the given feature referencing lookup 0
    `0001 ${tagHex} 0008 0000 0001 0000`,
    // LookupList
    hex16(lookups.length),
    ...lookupOffsets,
    ...lookupHexes,
  );
}

function buildGposTable(lookups: { type: number; subtable: string[] }[]): GposTable {
  return GposTable.read(
    buildLayoutTableData(
      'kern',
      lookups.map(({ type, subtable }) => ({ type, subtables: [subtable] })),
    ),
  );
}

function buildGsubTable(lookups: { type: number; subtables: string[][] }[]): GsubTable {
  return GsubTable.read(buildLayoutTableData('test', lookups));
}

function createGlyphRun(glyphIds: number[]): GlyphRun {
  return { glyphs: glyphIds.map((glyphId) => ({ glyphId, codePoints: [glyphId], advance: 500 })) };
}
