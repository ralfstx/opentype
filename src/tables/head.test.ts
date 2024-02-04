import { fromLongDateTime, HeadTable, MacStyle, toLongDateTime } from 'src/tables/head.ts';
import { fromHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('HeadTable', () => {
  describe('constructor', () => {
    test('sets all values', () => {
      const data = fromHexString(
        '00 01 00 00', // majorVersion, minorVersion
        '00 01 33 33', // fontRevision
        '00 00 00 17', // checksumAdjustment
        '5f 0f 3c f5', // magicNumber
        '00 01', // flags
        '03 e9', // unitsPerEm
        'da 31 bb b0', // created date
        'e1 b7 e9 40', // modified date
        '00 02 00 03', // xMin, yMin
        '01 90 01 f4', // xMax, yMax
        '00 06', // macStyle
        '00 07', // lowestRecPPEM
        '00 02', // fontDirectionHint
        '00 01', // indexToLocFormat
        '00 00' // glyphDataFormat
      );

      const table = new HeadTable(data);

      expect(table.fontRevision).toBe(1.2);
      expect(table.checksumAdjustment).toBe(23);
      expect(table.flags).toBe(1);
      expect(table.unitsPerEm).toBe(1001);
      expect(table.created).toEqual(new Date('2020-01-01T03:00:00.000Z'));
      expect(table.modified).toEqual(new Date('2024-01-01T04:00:00.000Z'));
      expect(table.xMin).toBe(2);
      expect(table.yMin).toBe(3);
      expect(table.xMax).toBe(400);
      expect(table.yMax).toBe(500);
      expect(table.macStyle).toBe(6);
      expect(table.lowestRecPPEM).toBe(7);
      expect(table.indexToLocFormat).toBe(1);
    });
  });
});

test('fromLongDateTime', () => {
  expect(fromLongDateTime(0)).toEqual(new Date('1904-01-01T00:00:00.000Z'));
  expect(fromLongDateTime(1)).toEqual(new Date('1904-01-01T00:00:01.000Z'));
});

test('toLongDateTime', () => {
  expect(toLongDateTime(new Date('1904-01-01T00:00:00.000Z'))).toBe(0);
  expect(toLongDateTime(new Date('1904-01-01T00:00:01.000Z'))).toBe(1);
});

describe('MacStyle', () => {
  test('bits', () => {
    expect(MacStyle.bold | MacStyle.italic).toBe(0b0000_0011);
    expect(MacStyle.shadow | MacStyle.extended).toBe(0b0101_0000);
  });
});
