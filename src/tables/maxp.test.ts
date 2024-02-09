import { MaxpTable, MaxpTable10 } from 'src/tables/maxp.ts';
import { fromHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('MaxpTable', () => {
  describe('constructor', () => {
    test('reads version 0.5', () => {
      const data = fromHexString(
        '00 00 50 00', // version 0.5
        '00 ff' // numGlyphs
      );

      const table = MaxpTable.read(data);

      expect(table.numGlyphs).toBe(255);
    });

    test('reads version 1.0', () => {
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
        '00 0d' // maxComponentDepth
      );

      const table = MaxpTable.read(data) as MaxpTable10;

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
