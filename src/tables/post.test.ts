import { describe, expect, it } from 'vitest';

import { DataWriter } from '../data-writer.ts';
import { PostTable, PostTableBuilder } from '../tables/post.ts';
import { fromHexString } from '../test-utils.ts';

describe('PostTable', () => {
  describe('read', () => {
    it('reads version 1.0', () => {
      const data = fromHexString(
        '00 01 00 00', //version
        '00 02 00 00', // italicAngle
        '00 03', // underlinePosition
        '00 04', // underlineThickness
        '00 00 00 05', // isFixedPitch
        '00 00 00 06', // minMemType42
        '00 00 00 07', // maxMemType42
        '00 00 00 08', // minMemType1
        '00 00 00 09', // maxMemType1
      );

      const table = PostTable.read(data);

      expect(table.version).toBe('v1.0');
      expect(table.italicAngle).toBe(2);
      expect(table.underlinePosition).toBe(3);
      expect(table.underlineThickness).toBe(4);
      expect(table.isFixedPitch).toBe(5);
      expect(table.minMemType42).toBe(6);
      expect(table.maxMemType42).toBe(7);
      expect(table.minMemType1).toBe(8);
      expect(table.maxMemType1).toBe(9);
    });

    it('reads version 2.0', () => {
      const data = fromHexString(
        '00 02 00 00', //version
        '00 02 00 00', // italicAngle
        '00 03', // underlinePosition
        '00 04', // underlineThickness
        '00 00 00 05', // isFixedPitch
        '00 00 00 06', // minMemType42
        '00 00 00 07', // maxMemType42
        '00 00 00 08', // minMemType1
        '00 00 00 09', // maxMemType1
        '00 03', // numGlyphs
        '00 24', // glyphNameIndex[0] -> A
        '01 02', // glyphNameIndex[1] -> 258 -> [0]
        '01 03', // glyphNameIndex[2] -> 259 -> [1]
        '03 66 6f 6f', // "foo"
        '03 62 61 72', // "bar"
      );
      const table = PostTable.read(data);

      expect(table.version).toBe('v2.0');
      expect(table.italicAngle).toBe(2);
      expect(table.underlinePosition).toBe(3);
      expect(table.underlineThickness).toBe(4);
      expect(table.isFixedPitch).toBe(5);
      expect(table.minMemType42).toBe(6);
      expect(table.maxMemType42).toBe(7);
      expect(table.minMemType1).toBe(8);
      expect(table.maxMemType1).toBe(9);
      expect(table.getGlyphName(0)).toBe('A');
      expect(table.getGlyphName(1)).toBe('foo');
      expect(table.getGlyphName(2)).toBe('bar');
      expect(table.getGlyphName(3)).toBeUndefined();
    });

    it('reads version 2.5', () => {
      const data = fromHexString(
        '00 02 50 00', //version
        '00 02 00 00', // italicAngle
        '00 03', // underlinePosition
        '00 04', // underlineThickness
        '00 00 00 05', // isFixedPitch
        '00 00 00 06', // minMemType42
        '00 00 00 07', // maxMemType42
        '00 00 00 08', // minMemType1
        '00 00 00 09', // maxMemType1
        '00 03', // numGlyphs
        '24', // offsets[0] 36 + 0 -> A
        '24', // offsets[1] 36 + 1 -> B
        '24', // offsets[2] 36 + 2 -> C
      );
      const table = PostTable.read(data);

      expect(table.version).toBe('v2.5');
      expect(table.italicAngle).toBe(2);
      expect(table.underlinePosition).toBe(3);
      expect(table.underlineThickness).toBe(4);
      expect(table.isFixedPitch).toBe(5);
      expect(table.minMemType42).toBe(6);
      expect(table.maxMemType42).toBe(7);
      expect(table.minMemType1).toBe(8);
      expect(table.maxMemType1).toBe(9);
      expect(table.getGlyphName(0)).toBe('A');
      expect(table.getGlyphName(1)).toBe('B');
      expect(table.getGlyphName(2)).toBe('C');
      expect(table.getGlyphName(3)).toBeUndefined();
    });

    it('reads version 3.0', () => {
      const data = fromHexString(
        '00 03 00 00', //version
        '00 02 00 00', // italicAngle
        '00 03', // underlinePosition
        '00 04', // underlineThickness
        '00 00 00 05', // isFixedPitch
        '00 00 00 06', // minMemType42
        '00 00 00 07', // maxMemType42
        '00 00 00 08', // minMemType1
        '00 00 00 09', // maxMemType1
      );

      const table = PostTable.read(data);

      expect(table.version).toBe('v3.0');
      expect(table.italicAngle).toBe(2);
      expect(table.underlinePosition).toBe(3);
      expect(table.underlineThickness).toBe(4);
      expect(table.isFixedPitch).toBe(5);
      expect(table.minMemType42).toBe(6);
      expect(table.maxMemType42).toBe(7);
      expect(table.minMemType1).toBe(8);
      expect(table.maxMemType1).toBe(9);
      expect(table.getGlyphName(0)).toBeUndefined();
    });
  });
});

describe('PostTableBuilder', () => {
  it('writes table', () => {
    const data = fromHexString(
      '00 03 00 00', //version
      '00 02 00 00', // italicAngle
      '00 03', // underlinePosition
      '00 04', // underlineThickness
      '00 00 00 05', // isFixedPitch
      '00 00 00 06', // minMemType42
      '00 00 00 07', // maxMemType42
      '00 00 00 08', // minMemType1
      '00 00 00 09', // maxMemType1
    );

    const table = PostTable.read(data);
    const builder = new PostTableBuilder(table);
    const writer = new DataWriter();
    builder.writeTable(writer);

    expect(writer.getData()).toEqual(data);
  });
});
