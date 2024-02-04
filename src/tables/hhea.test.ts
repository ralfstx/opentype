import { HheaTable } from 'src/tables/hhea.ts';
import { fromHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('HheaTable', () => {
  describe('constructor', () => {
    test('sets all values', () => {
      const data = fromHexString(
        '00 01 00 00', // majorVersion, minorVersion
        '00 01', // ascender
        '00 02', // descender
        '00 03', // lineGap
        '00 04', // advanceWidthMax
        '00 05', // minLeftSideBearing
        '00 06', // minRightSideBearing
        '00 07', // xMaxExtent
        '00 08', // caretSlopeRise
        '00 09', // caretSlopeRun
        '00 0a', // caretOffset
        '00 00 00 00 00 00 00 00', // reserved
        '00 00', // metricDataFormat
        '00 0b' // numberOfHMetrics
      );

      const table = new HheaTable(data);

      expect(table.ascender).toBe(1);
      expect(table.descender).toBe(2);
      expect(table.lineGap).toBe(3);
      expect(table.advanceWidthMax).toBe(4);
      expect(table.minLeftSideBearing).toBe(5);
      expect(table.minRightSideBearing).toBe(6);
      expect(table.xMaxExtent).toBe(7);
      expect(table.caretSlopeRise).toBe(8);
      expect(table.caretSlopeRun).toBe(9);
      expect(table.caretOffset).toBe(10);
      expect(table.numberOfHMetrics).toBe(11);
    });
  });
});
