import { describe, expect, it } from 'vitest';

import { fromHexString } from '../test-utils.ts';
import { GdefTable, GlyphClass } from './gdef.ts';

describe('GdefTable', () => {
  describe('read', () => {
    it('reads a version 1.0 table with glyph class definitions', () => {
      const data = fromHexString(
        // GDEF header (version 1.0)
        '00 01', // majorVersion
        '00 00', // minorVersion
        '00 0c', // glyphClassDefOffset = 12
        '00 00', // attachListOffset (none)
        '00 00', // ligCaretListOffset (none)
        '00 00', // markAttachClassDefOffset (none)
        // ClassDefTable (format 1) at offset 12
        '00 01', // format 1
        '00 0a', // startGlyphID = 10
        '00 04', // glyphCount = 4
        '00 01', // glyph 10 = Base (1)
        '00 02', // glyph 11 = Ligature (2)
        '00 03', // glyph 12 = Mark (3)
        '00 04', // glyph 13 = Component (4)
      );

      const table = GdefTable.read(data);

      expect(table.glyphClassDef).toBeDefined();
      expect(table.getGlyphClass(10)).toBe(GlyphClass.Base);
      expect(table.getGlyphClass(11)).toBe(GlyphClass.Ligature);
      expect(table.getGlyphClass(12)).toBe(GlyphClass.Mark);
      expect(table.getGlyphClass(13)).toBe(GlyphClass.Component);
    });

    it('returns class 0 for glyphs without a class definition', () => {
      const data = fromHexString(
        '00 01', // majorVersion
        '00 00', // minorVersion
        '00 0c', // glyphClassDefOffset = 12
        '00 00', // attachListOffset
        '00 00', // ligCaretListOffset
        '00 00', // markAttachClassDefOffset
        // ClassDefTable (format 1)
        '00 01', // format 1
        '00 0a', // startGlyphID = 10
        '00 01', // glyphCount = 1
        '00 01', // glyph 10 = Base (1)
      );

      const table = GdefTable.read(data);

      expect(table.getGlyphClass(99)).toBe(0);
    });

    it('handles a table with no optional subtables', () => {
      const data = fromHexString(
        '00 01', // majorVersion
        '00 00', // minorVersion
        '00 00', // glyphClassDefOffset (none)
        '00 00', // attachListOffset (none)
        '00 00', // ligCaretListOffset (none)
        '00 00', // markAttachClassDefOffset (none)
      );

      const table = GdefTable.read(data);

      expect(table.glyphClassDef).toBeUndefined();
      expect(table.markAttachClassDef).toBeUndefined();
      expect(table.markGlyphSets).toBeUndefined();
      expect(table.getGlyphClass(1)).toBe(0);
      expect(table.getMarkAttachClass(1)).toBe(0);
      expect(table.isMarkInSet(1, 0)).toBe(false);
    });

    it('reads mark attachment class definitions', () => {
      const data = fromHexString(
        '00 01', // majorVersion
        '00 00', // minorVersion
        '00 00', // glyphClassDefOffset (none)
        '00 00', // attachListOffset
        '00 00', // ligCaretListOffset
        '00 0c', // markAttachClassDefOffset = 12
        // ClassDefTable (format 2) at offset 12
        '00 02', // format 2
        '00 02', // classRangeCount = 2
        '00 14', // range 1: start = 20
        '00 17', // range 1: end = 23
        '00 01', // range 1: class = 1
        '00 1e', // range 2: start = 30
        '00 1f', // range 2: end = 31
        '00 02', // range 2: class = 2
      );

      const table = GdefTable.read(data);

      expect(table.markAttachClassDef).toBeDefined();
      expect(table.getMarkAttachClass(20)).toBe(1);
      expect(table.getMarkAttachClass(23)).toBe(1);
      expect(table.getMarkAttachClass(30)).toBe(2);
      expect(table.getMarkAttachClass(31)).toBe(2);
      expect(table.getMarkAttachClass(99)).toBe(0);
    });

    it('reads a version 1.2 table with mark glyph sets', () => {
      const data = fromHexString(
        // GDEF header (version 1.2)
        '00 01', // majorVersion
        '00 02', // minorVersion
        '00 00', // glyphClassDefOffset (none)
        '00 00', // attachListOffset
        '00 00', // ligCaretListOffset
        '00 00', // markAttachClassDefOffset
        '00 0e', // markGlyphSetsDefOffset = 14
        // MarkGlyphSetsTable at offset 14
        '00 01', // format = 1
        '00 02', // markGlyphSetCount = 2
        '00 00 00 0c', // offset to coverage 0 = 12 (relative to MarkGlyphSetsTable)
        '00 00 00 14', // offset to coverage 1 = 20 (relative to MarkGlyphSetsTable)
        // CoverageTable 0 (format 1) at MarkGlyphSetsTable + 12
        '00 01', // format 1
        '00 02', // glyphCount = 2
        '00 05', // glyph 5
        '00 06', // glyph 6
        // CoverageTable 1 (format 1) at MarkGlyphSetsTable + 22
        '00 01', // format 1
        '00 01', // glyphCount = 1
        '00 0a', // glyph 10
      );

      const table = GdefTable.read(data);

      expect(table.markGlyphSets).toBeDefined();
      expect(table.markGlyphSets).toHaveLength(2);
      expect(table.isMarkInSet(5, 0)).toBe(true);
      expect(table.isMarkInSet(6, 0)).toBe(true);
      expect(table.isMarkInSet(10, 0)).toBe(false);
      expect(table.isMarkInSet(10, 1)).toBe(true);
      expect(table.isMarkInSet(5, 1)).toBe(false);
    });

    it('returns false for out-of-range mark glyph set index', () => {
      const data = fromHexString(
        '00 01', // majorVersion
        '00 02', // minorVersion
        '00 00', // glyphClassDefOffset
        '00 00', // attachListOffset
        '00 00', // ligCaretListOffset
        '00 00', // markAttachClassDefOffset
        '00 0e', // markGlyphSetsDefOffset = 14
        // MarkGlyphSetsTable
        '00 01', // format = 1
        '00 01', // markGlyphSetCount = 1
        '00 00 00 08', // offset to coverage 0 = 8
        // CoverageTable 0 (format 1)
        '00 01', // format 1
        '00 01', // glyphCount = 1
        '00 05', // glyph 5
      );

      const table = GdefTable.read(data);

      expect(table.isMarkInSet(5, 0)).toBe(true);
      expect(table.isMarkInSet(5, 99)).toBe(false);
    });

    it('reads a version 1.3 table (skips itemVarStoreOffset)', () => {
      const data = fromHexString(
        '00 01', // majorVersion
        '00 03', // minorVersion
        '00 12', // glyphClassDefOffset = 18
        '00 00', // attachListOffset
        '00 00', // ligCaretListOffset
        '00 00', // markAttachClassDefOffset
        '00 00', // markGlyphSetsDefOffset (none)
        '00 00 00 00', // itemVarStoreOffset (none)
        // ClassDefTable at offset 18
        '00 01', // format 1
        '00 01', // startGlyphID = 1
        '00 01', // glyphCount = 1
        '00 01', // glyph 1 = Base (1)
      );

      const table = GdefTable.read(data);

      expect(table.getGlyphClass(1)).toBe(GlyphClass.Base);
    });

    it('throws on unsupported major version', () => {
      const data = fromHexString(
        '00 02', // majorVersion = 2 (unsupported)
        '00 00', // minorVersion
        '00 00 00 00 00 00 00 00',
      );

      expect(() => GdefTable.read(data)).toThrow('Unsupported GDEF table version 2');
    });
  });
});
