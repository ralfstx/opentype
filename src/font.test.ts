import { describe, expect, it } from 'vitest';

import { Font } from './font.ts';
import { fromHexString } from './test-utils.ts';

describe('Font', () => {
  describe('fromData', () => {
    it('throws an error if the font signature is unsupported', () => {
      const data = new Uint8Array(Array.from({ length: 28 }, (_, i) => i));

      const result = () => Font.fromData(data);

      expect(result).toThrow('Unsupported font signature: 0x00010203');
    });

    it('creates a Font instance for valid TrueType font data', () => {
      const data = fromHexString(
        '00 01 00 00', // sfnt version (TrueType)
        '00 01', // numTables
        '00 00', // searchRange
        '00 00', // entrySelector
        '00 00', // rangeShift
        // Table Record
        '63 6d 61 70', // tableTag 'cmap'
        '00 00 00 00', // checksum
        '00 00 00 10', // offset
        '00 00 00 20', // length
      );

      const font = Font.fromData(new Uint8Array(data.buffer));

      expect(font).toBeInstanceOf(Font);
      expect(font.type).toBe('TrueType');
      expect(font.tableRecords).toHaveLength(1);
      expect(font.tableRecords[0].tableTag).toBe('cmap');
    });

    it('respects the byte offset of the given view', () => {
      const data = fromHexString(
        'ff ff ff ff', // padding in front of the font data
        '00 01 00 00', // sfnt version (TrueType)
        '00 01', // numTables
        '00 00', // searchRange
        '00 00', // entrySelector
        '00 00', // rangeShift
        // Table Record
        '63 6d 61 70', // tableTag 'cmap'
        '00 00 00 00', // checksum
        '00 00 00 10', // offset
        '00 00 00 20', // length
      );

      const font = Font.fromData(new Uint8Array(data.buffer, 4));

      expect(font.type).toBe('TrueType');
      expect(font.tableRecords[0].tableTag).toBe('cmap');
    });
  });
});
