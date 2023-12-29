import { DataWriter } from 'src/data-writer.ts';
import {
  fromLongDateTime,
  HeadTable,
  MacStyle,
  readHeadTable,
  toLongDateTime,
} from 'src/tables/head.ts';
import { describe, expect, test } from 'vitest';

describe('HeadTable', () => {
  describe('constructor', () => {
    test('sets all values', () => {
      const table = new HeadTable({
        fontRevision: 1.2,
        checksumAdjustment: 23,
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
      });

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
      expect(table.macStyle).toEqual(new MacStyle(6));
      expect(table.lowestRecPPEM).toBe(7);
      expect(table.indexToLocFormat).toBe(1);
    });

    test('fills in defaults', () => {
      const table = new HeadTable({
        fontRevision: 1.2,
        unitsPerEm: 1000,
        xMin: 1,
        yMin: 2,
        xMax: 300,
        yMax: 400,
        lowestRecPPEM: 5,
      });

      expect(table.checksumAdjustment).toBe(0);
      expect(table.flags).toBe(0);
      expect(table.unitsPerEm).toBe(1000);
      expect(table.created.getTime()).toBeCloseTo(Date.now(), -4);
      expect(table.modified.getTime()).toBeCloseTo(Date.now(), -4);
      expect(table.macStyle).toEqual(new MacStyle(0));
      expect(table.indexToLocFormat).toBe(0);
    });
  });

  test('write', () => {
    const table = new HeadTable({
      fontRevision: 1.2,
      checksumAdjustment: 23,
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
    });

    const writer = new DataWriter();
    table.write(writer);
    const result = readHeadTable(writer.getData());

    expect(result).toEqual(table);
  });

  test('read', () => {
    const table = new HeadTable({
      fontRevision: 1.0,
      flags: 0,
      unitsPerEm: 1000,
      xMin: 0,
      yMin: 0,
      xMax: 1000,
      yMax: 1000,
      created: new Date('1904-01-01T00:00:00.000Z'),
      modified: new Date('1904-01-01T00:00:00.000Z'),
      macStyle: 0,
      lowestRecPPEM: 0,
      indexToLocFormat: 0,
    });

    const writer = new DataWriter();
    table.write(writer);
    const data = writer.getData();
    const result = readHeadTable(data);

    expect(result.fontRevision).toBe(1.0);
    expect(result.flags).toBe(0);
    expect(result.unitsPerEm).toBe(1000);
    expect(result.xMin).toBe(0);
    expect(result.yMin).toBe(0);
    expect(result.xMax).toBe(1000);
    expect(result.yMax).toBe(1000);
    expect(result.created).toEqual(new Date('1904-01-01T00:00:00.000Z'));
    expect(result.modified).toEqual(new Date('1904-01-01T00:00:00.000Z'));
    expect(result.checksumAdjustment).toBe(0);
    expect(result.macStyle).toEqual(new MacStyle(0));
    expect(result.lowestRecPPEM).toBe(0);
    expect(result.indexToLocFormat).toBe(0);
  });

  test('fromLongDateTime', () => {
    expect(fromLongDateTime(0)).toEqual(new Date('1904-01-01T00:00:00.000Z'));
    expect(fromLongDateTime(1)).toEqual(new Date('1904-01-01T00:00:01.000Z'));
  });

  test('toLongDateTime', () => {
    expect(toLongDateTime(new Date('1904-01-01T00:00:00.000Z'))).toBe(0);
    expect(toLongDateTime(new Date('1904-01-01T00:00:01.000Z'))).toBe(1);
  });
});
