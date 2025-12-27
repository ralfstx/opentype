import { describe, expect, it } from 'vitest';

import { fromHexString } from '../../test-utils.ts';
import { CoverageTable } from './coverage.ts';

describe('CoverageTable', () => {
  describe('read', () => {
    it('reads format 1 coverage table', () => {
      const data = fromHexString(
        '00 01', // format
        '00 03', // glyphCount
        '00 01 00 02 00 03', // glyphIds
      );

      const table = CoverageTable.read(data);

      expect(table.lookupGlyphId(0)).toBe(-1);
      expect(table.lookupGlyphId(1)).toBe(0);
      expect(table.lookupGlyphId(2)).toBe(1);
      expect(table.lookupGlyphId(3)).toBe(2);
      expect(table.lookupGlyphId(4)).toBe(-1);
    });

    it('reads format 2 coverage table', () => {
      const data = fromHexString(
        '00 02', // format
        '00 02', // rangeCount
        '00 01 00 03 00 00', // range 1: start, end, startCoverageIndex
        '00 05 00 07 00 03', // range 2: start, end, startCoverageIndex
      );

      const table = CoverageTable.read(data);

      expect(table.lookupGlyphId(0)).toBe(-1);
      expect(table.lookupGlyphId(1)).toBe(0);
      expect(table.lookupGlyphId(2)).toBe(1);
      expect(table.lookupGlyphId(3)).toBe(2);
      expect(table.lookupGlyphId(4)).toBe(-1);
      expect(table.lookupGlyphId(5)).toBe(3);
      expect(table.lookupGlyphId(6)).toBe(4);
      expect(table.lookupGlyphId(7)).toBe(5);
      expect(table.lookupGlyphId(8)).toBe(-1);
    });
  });
});
