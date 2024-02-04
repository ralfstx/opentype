import { DataWriter } from 'src/data-writer.ts';
import { HeadTable } from 'src/tables/head.ts';
import { HeadTableBuilder } from 'src/tables/head-builder.ts';
import { toHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('HeadTableBuilder', () => {
  describe('constructor', () => {
    test('sets all given values', () => {
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
      expect(builder.macStyle).toEqual(6);
      expect(builder.lowestRecPPEM).toBe(7);
      expect(builder.indexToLocFormat).toBe(1);
    });

    test('fills in defaults', () => {
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
      expect(builder.macStyle).toEqual(0);
      expect(builder.lowestRecPPEM).toBe(0);
      expect(builder.indexToLocFormat).toBe(0);
    });
  });

  test('build', () => {
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
        'da 31 bb b0', // created date
        'e1 b7 e9 40', // modified date
        '00 02 00 03', // xMin, yMin
        '01 90 01 f4', // xMax, yMax
        '00 06', // macStyle
        '00 07', // lowestRecPPEM
        '00 02', // fontDirectionHint
        '00 01', // indexToLocFormat
        '00 00', // glyphDataFormat
      ].join(' ')
    );
  });
});
