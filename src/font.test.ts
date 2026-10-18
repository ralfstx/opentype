import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

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

  describe('metrics and style', () => {
    let fontData: Uint8Array;

    beforeAll(async () => {
      const fileName = new URL('../fonts/gentium/Gentium-Regular.ttf', import.meta.url).pathname;
      fontData = new Uint8Array(await readFile(fileName));
    });

    it('reads metrics from the font tables', () => {
      const font = Font.fromData(fontData);

      expect(font.capHeight).toBe(1260);
      expect(font.xHeight).toBe(930);
      expect(font.italicAngle).toBe(0);
      expect(font.bbox).toEqual({ xMin: -1386, yMin: -1400, xMax: 4402, yMax: 2600 });
      expect(font.style).toBe('normal');
      expect(font.weight).toBe(400);
    });

    it('measures cap height and x-height from glyph outlines if OS/2 lacks them', () => {
      // Set sCapHeight (offset 88) and sxHeight (offset 86) to zero
      const font = Font.fromData(patchTable(fontData, 'OS/2', 86, [0, 0, 0, 0]));

      expect(font.capHeight).toBe(1260); // top of the "H" outline
      expect(font.xHeight).toBe(930); // top of the "x" outline
    });

    it('returns undefined heights if neither OS/2 nor TrueType outlines provide them', () => {
      const withoutHeights = patchTable(fontData, 'OS/2', 86, [0, 0, 0, 0]);
      const font = Font.fromData(hideTable(withoutHeights, 'glyf'));

      expect(font.capHeight).toBeUndefined();
      expect(font.xHeight).toBeUndefined();
    });

    it('returns an undefined weight if the weight class is out of range', () => {
      // usWeightClass (offset 4 in OS/2) = 0
      const font = Font.fromData(patchTable(fontData, 'OS/2', 4, [0x00, 0x00]));

      expect(font.weight).toBeUndefined();
    });

    it('returns an undefined weight if there is no OS/2 table', () => {
      const font = Font.fromData(hideTable(fontData, 'OS/2'));

      expect(font.weight).toBeUndefined();
    });

    it('derives the style from OS/2 fsSelection', () => {
      // fsSelection (offset 62): ITALIC = 0x0001, OBLIQUE = 0x0200
      const italic = Font.fromData(patchTable(fontData, 'OS/2', 62, [0x00, 0x01]));
      const oblique = Font.fromData(patchTable(fontData, 'OS/2', 62, [0x02, 0x00]));

      expect(italic.style).toBe('italic');
      expect(oblique.style).toBe('oblique');
    });

    it('ignores the oblique flag for OS/2 versions before 4', () => {
      // version (offset 0) = 3, fsSelection (offset 62) = OBLIQUE
      const data = patchTable(patchTable(fontData, 'OS/2', 0, [0x00, 0x03]), 'OS/2', 62, [0x02, 0x00]);

      expect(Font.fromData(data).style).toBe('normal');
    });

    it('does not derive the style from the italic angle', () => {
      // italicAngle (offset 4 in post) as 16.16 fixed: -12.0
      const font = Font.fromData(patchTable(fontData, 'post', 4, [0xff, 0xf4, 0x00, 0x00]));

      expect(font.italicAngle).toBe(-12);
      expect(font.style).toBe('normal');
    });

    it('derives the style from macStyle if there is no OS/2 table', () => {
      // macStyle (offset 44 in head): italic = 0x0002
      const data = hideTable(patchTable(fontData, 'head', 44, [0x00, 0x02]), 'OS/2');

      expect(Font.fromData(data).style).toBe('italic');
    });
  });
});

/**
 * Returns a copy of the font data with the given bytes written at the given
 * offset within a table.
 */
function patchTable(fontData: Uint8Array, tag: string, offset: number, bytes: number[]): Uint8Array {
  const record = Font.fromData(fontData).tableRecords.find((record) => record.tableTag === tag)!;
  const copy = fontData.slice();
  copy.set(bytes, record.offset + offset);
  return copy;
}

/**
 * Returns a copy of the font data in which the table with the given tag is
 * renamed in the table directory, so that it cannot be found.
 */
function hideTable(fontData: Uint8Array, tag: string): Uint8Array {
  const copy = fontData.slice();
  const numTables = (copy[4] << 8) | copy[5];
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16;
    if (String.fromCharCode(...copy.subarray(offset, offset + 4)) === tag) {
      copy.set([0x78, 0x78, 0x78, 0x78], offset); // 'xxxx'
    }
  }
  return copy;
}
