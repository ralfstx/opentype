import { describe, expect, it } from 'vitest';

import { fromHexString, toHexString } from '../../test/utils.ts';
import { DataWriter } from '../data-writer.ts';
import {
  fromLongDateTime,
  HeadTable,
  HeadTableBuilder,
  MacStyle,
  toLongDateTime,
} from '../tables/head.ts';

describe('HeadTable', () => {
  describe('constructor', () => {
    it('sets all values', () => {
      const data = fromHexString(
        '00 01 00 00', // majorVersion, minorVersion
        '00 01 33 33', // fontRevision
        '00 00 00 17', // checksumAdjustment
        '5f 0f 3c f5', // magicNumber
        '00 01', // flags
        '03 e9', // unitsPerEm
        '00 00 00 00 da 31 bb b0', // created date
        '00 00 00 00 e1 b7 e9 40', // modified date
        '00 02 00 03', // xMin, yMin
        '01 90 01 f4', // xMax, yMax
        '00 06', // macStyle
        '00 07', // lowestRecPPEM
        '00 02', // fontDirectionHint
        '00 01', // indexToLocFormat
        '00 00', // glyphDataFormat
      );

      const table = HeadTable.read(data);

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

describe('fromLongDateTime', () => {
  it('converts correctly', () => {
    expect(fromLongDateTime(0, 0)).toEqual(new Date('1904-01-01T00:00:00.000Z'));
    expect(fromLongDateTime(0, 1)).toEqual(new Date('1904-01-01T00:00:01.000Z'));
    expect(fromLongDateTime(1, 0)).toEqual(new Date('2040-02-06T06:28:16.000Z'));
  });
});

describe('toLongDateTime', () => {
  it('converts correctly', () => {
    expect(toLongDateTime(new Date('1904-01-01T00:00:00.000Z'))).toEqual({ hi: 0, lo: 0 });
    expect(toLongDateTime(new Date('1904-01-01T00:00:01.000Z'))).toEqual({ hi: 0, lo: 1 });
    expect(toLongDateTime(new Date('2040-02-06T06:28:16.000Z'))).toEqual({ hi: 1, lo: 0 });
  });
});

describe('MacStyle', () => {
  it('supports bitwise operations', () => {
    expect(MacStyle.bold | MacStyle.italic).toBe(0b0000_0011);
    expect(MacStyle.shadow | MacStyle.extended).toBe(0b0101_0000);
  });
});

describe('HeadTableBuilder', () => {
  describe('constructor', () => {
    it('sets all given values', () => {
      const builder = new HeadTableBuilder({
        fontRevision: 1.2,
        flags: 1,
        unitsPerEm: 1001,
        created: new Date('2020-01-01T03:00:00.000Z'),
        modified: new Date('2024-01-01T04:00:00.000Z'),
        xMin: 2,
        yMin: 3,
        xMax: 400,
        yMax: 500,
        macStyle: 6,
        lowestRecPPEM: 7,
        indexToLocFormat: 1,
      } as HeadTable);

      expect(builder.fontRevision).toBe(1.2);
      expect(builder.flags).toBe(1);
      expect(builder.unitsPerEm).toBe(1001);
      expect(builder.created).toEqual(new Date('2020-01-01T03:00:00.000Z'));
      expect(builder.modified).toEqual(new Date('2024-01-01T04:00:00.000Z'));
      expect(builder.xMin).toBe(2);
      expect(builder.yMin).toBe(3);
      expect(builder.xMax).toBe(400);
      expect(builder.yMax).toBe(500);
      expect(builder.macStyle).toBe(6);
      expect(builder.lowestRecPPEM).toBe(7);
      expect(builder.indexToLocFormat).toBe(1);
    });

    it('fills in defaults', () => {
      const builder = new HeadTableBuilder();

      expect(builder.fontRevision).toBe(0);
      expect(builder.flags).toBe(0);
      expect(builder.unitsPerEm).toBe(0);
      expect(builder.created.getTime()).toBeCloseTo(Date.now(), -4);
      expect(builder.modified.getTime()).toBeCloseTo(Date.now(), -4);
      expect(builder.xMin).toBe(0);
      expect(builder.yMin).toBe(0);
      expect(builder.xMax).toBe(0);
      expect(builder.yMax).toBe(0);
      expect(builder.macStyle).toBe(0);
      expect(builder.lowestRecPPEM).toBe(0);
      expect(builder.indexToLocFormat).toBe(0);
    });
  });

  it('writes table correctly', () => {
    const builder = new HeadTableBuilder();
    builder.fontRevision = 1.2;
    builder.flags = 1;
    builder.unitsPerEm = 1001;
    builder.created = new Date('2020-01-01T03:00:00.000Z');
    builder.modified = new Date('2024-01-01T04:00:00.000Z');
    builder.xMin = 2;
    builder.yMin = 3;
    builder.xMax = 400;
    builder.yMax = 500;
    builder.macStyle = 6;
    builder.lowestRecPPEM = 7;
    builder.indexToLocFormat = 1;

    const writer = new DataWriter();
    builder.writeTable(writer);
    const result = writer.getData();

    expect(toHexString(result)).toEqual(
      [
        '00 01 00 00', // majorVersion, minorVersion
        '00 01 33 33', // fontRevision
        '00 00 00 00', // checksumAdjustment
        '5f 0f 3c f5', // magicNumber
        '00 01', // flags
        '03 e9', // unitsPerEm
        '00 00 00 00 da 31 bb b0', // created date
        '00 00 00 00 e1 b7 e9 40', // modified date
        '00 02 00 03', // xMin, yMin
        '01 90 01 f4', // xMax, yMax
        '00 06', // macStyle
        '00 07', // lowestRecPPEM
        '00 02', // fontDirectionHint
        '00 01', // indexToLocFormat
        '00 00', // glyphDataFormat
      ].join(' '),
    );
  });
});
