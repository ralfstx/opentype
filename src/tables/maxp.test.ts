import { describe, expect, it } from 'vitest';

import { DataWriter } from '../data-writer.ts';
import { MaxpTable, MaxpTableBuilder } from '../tables/maxp.ts';
import { fromHexString, toHexString } from '../test-utils.ts';

describe('MaxpTable', () => {
  describe('constructor', () => {
    it('reads version 0.5', () => {
      const data = fromHexString(
        '00 00 50 00', // version 0.5
        '00 ff', // numGlyphs
      );

      const table = MaxpTable.read(data);

      expect(table.numGlyphs).toBe(255);
      expect(table.maxPoints).toBeUndefined();
      expect(table.maxContours).toBeUndefined();
      expect(table.maxCompositePoints).toBeUndefined();
      expect(table.maxCompositeContours).toBeUndefined();
      expect(table.maxZones).toBeUndefined();
      expect(table.maxTwilightPoints).toBeUndefined();
      expect(table.maxStorage).toBeUndefined();
      expect(table.maxFunctionDefs).toBeUndefined();
      expect(table.maxInstructionDefs).toBeUndefined();
      expect(table.maxStackElements).toBeUndefined();
      expect(table.maxSizeOfInstructions).toBeUndefined();
      expect(table.maxComponentElements).toBeUndefined();
      expect(table.maxComponentDepth).toBeUndefined();
    });

    it('reads version 1.0', () => {
      const data = fromHexString(
        '00 01 00 00', // version 1.0
        '00 ff', // numGlyphs
        '00 01', // maxPoints
        '00 02', // maxContours
        '00 03', // maxCompositePoints
        '00 04', // maxCompositeContours
        '00 05', // maxZones
        '00 06', // maxTwilightPoints
        '00 07', // maxStorage
        '00 08', // maxFunctionDefs
        '00 09', // maxInstructionDefs
        '00 0a', // maxStackElements
        '00 0b', // maxSizeOfInstructions
        '00 0c', // maxComponentElements
        '00 0d', // maxComponentDepth
      );

      const table = MaxpTable.read(data);

      expect(table.numGlyphs).toBe(255);
      expect(table.maxPoints).toBe(1);
      expect(table.maxContours).toBe(2);
      expect(table.maxCompositePoints).toBe(3);
      expect(table.maxCompositeContours).toBe(4);
      expect(table.maxZones).toBe(5);
      expect(table.maxTwilightPoints).toBe(6);
      expect(table.maxStorage).toBe(7);
      expect(table.maxFunctionDefs).toBe(8);
      expect(table.maxInstructionDefs).toBe(9);
      expect(table.maxStackElements).toBe(10);
      expect(table.maxSizeOfInstructions).toBe(11);
      expect(table.maxComponentElements).toBe(12);
      expect(table.maxComponentDepth).toBe(13);
    });
  });
});

describe('MaxpTableBuilder', () => {
  it('writes table version 0.5', () => {
    const builder = new MaxpTableBuilder(0.5);
    builder.numGlyphs = 255;

    const writer = new DataWriter();
    builder.writeTable(writer);
    const result = writer.getData();

    expect(toHexString(result)).toEqual(
      [
        '00 00 50 00', // version 0.5
        '00 ff', // numGlyphs
      ].join(' '),
    );
  });

  it('writes table version 1.0', () => {
    const builder = new MaxpTableBuilder(1.0);
    builder.numGlyphs = 255;
    builder.maxPoints = 23;

    const writer = new DataWriter();
    builder.writeTable(writer);
    const result = writer.getData();

    expect(toHexString(result)).toEqual(
      [
        '00 01 00 00', // version 1.0
        '00 ff', // numGlyphs
        '00 17', // maxPoints
        '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
      ].join(' '),
    );
  });
});
