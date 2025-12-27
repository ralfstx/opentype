import { describe, expect, it } from 'vitest';

import { fromHexString, toHexString } from '../../test/utils.ts';
import { DataWriter } from '../data-writer.ts';
import { HheaTable, HheaTableBuilder } from '../tables/hhea.ts';

describe('HheaTable', () => {
  describe('constructor', () => {
    it('sets all values', () => {
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
        '00 0b', // numberOfHMetrics
      );

      const table = HheaTable.read(data);

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

describe('HheaTableBuilder', () => {
  describe('constructor', () => {
    it('sets all given values', () => {
      const builder = new HheaTableBuilder({
        ascender: 1,
        descender: 2,
        lineGap: 3,
        advanceWidthMax: 4,
        minLeftSideBearing: 5,
        minRightSideBearing: 6,
        xMaxExtent: 7,
        caretSlopeRise: 8,
        caretSlopeRun: 9,
        caretOffset: 10,
        numberOfHMetrics: 11,
      } as HheaTable);

      expect(builder.ascender).toBe(1);
      expect(builder.descender).toBe(2);
      expect(builder.lineGap).toBe(3);
      expect(builder.advanceWidthMax).toBe(4);
      expect(builder.minLeftSideBearing).toBe(5);
      expect(builder.minRightSideBearing).toBe(6);
      expect(builder.xMaxExtent).toBe(7);
      expect(builder.caretSlopeRise).toBe(8);
      expect(builder.caretSlopeRun).toBe(9);
      expect(builder.caretOffset).toBe(10);
      expect(builder.numberOfHMetrics).toBe(11);
    });

    it('fills in defaults', () => {
      const builder = new HheaTableBuilder();

      expect(builder.ascender).toBe(0);
      expect(builder.descender).toBe(0);
      expect(builder.lineGap).toBe(0);
      expect(builder.advanceWidthMax).toBe(0);
      expect(builder.minLeftSideBearing).toBe(0);
      expect(builder.minRightSideBearing).toBe(0);
      expect(builder.xMaxExtent).toBe(0);
      expect(builder.caretSlopeRise).toBe(0);
      expect(builder.caretSlopeRun).toBe(0);
      expect(builder.caretOffset).toBe(0);
      expect(builder.numberOfHMetrics).toBe(0);
    });
  });

  it('build', () => {
    const builder = new HheaTableBuilder();

    builder.ascender = 1;
    builder.descender = 2;
    builder.lineGap = 3;
    builder.advanceWidthMax = 4;
    builder.minLeftSideBearing = 5;
    builder.minRightSideBearing = 6;
    builder.xMaxExtent = 7;
    builder.caretSlopeRise = 8;
    builder.caretSlopeRun = 9;
    builder.caretOffset = 10;
    builder.numberOfHMetrics = 11;

    const writer = new DataWriter();
    builder.writeTable(writer);
    const result = writer.getData();

    expect(toHexString(result)).toEqual(
      [
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
        '00 0b', // numberOfHMetrics
      ].join(' '),
    );
  });
});
