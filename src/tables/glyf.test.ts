import { fromHexString, toHexString } from 'test/utils.ts';
import { describe, expect, it } from 'vitest';

import { DataWriter } from '../data-writer.ts';
import { GlyfTable, GlyfTableBuilder, readGlyph, writeGlyph } from '../tables/glyf.ts';
import { type LocaTable } from './loca.ts';
import { type MaxpTable } from './maxp.ts';

describe('GlyfTable', () => {
  it('reads data', () => {
    const maxpTable = { numGlyphs: 2 } as MaxpTable;
    const locaTable = { offsets: [0, 10, 20] } as LocaTable;

    const glyfTable = GlyfTable.read(new DataView(new ArrayBuffer(30)), maxpTable, locaTable);

    expect(glyfTable.numGlyphs).toBe(2);
    expect(glyfTable.offsets).toEqual([0, 10, 20]);
  });

  it('getGlyphData throws error for out-of-bounds glyph ID', () => {
    const locaTable = { offsets: [0, 10, 20] } as LocaTable;
    const maxpTable = { numGlyphs: 2 } as MaxpTable;
    const glyfTable = GlyfTable.read(new DataView(new ArrayBuffer(30)), maxpTable, locaTable);

    expect(() => glyfTable.getGlyphData(-1)).toThrow('Glyph ID -1 is out of bounds');
    expect(() => glyfTable.getGlyphData(2)).toThrow('Glyph ID 2 is out of bounds');
  });

  it('getGlyphData returns correct DataView for valid glyph ID', () => {
    const dummyData = new DataView(Uint8Array.from({ length: 30 }, (_, i) => i).buffer);
    const locaTable = { offsets: [0, 10, 20] } as LocaTable;
    const maxpTable = { numGlyphs: 2 } as MaxpTable;
    const glyfTable = GlyfTable.read(dummyData, maxpTable, locaTable);

    const glyphData = glyfTable.getGlyphData(1);

    expect(toHexString(glyphData)).toBe('0a 0b 0c 0d 0e 0f 10 11 12 13');
  });
});

describe('readGlyph', () => {
  it('reads simple glyph correctly', () => {
    const data = fromHexString(
      '00 01', // numberOfContours = 1
      '00 00 00 00 00 00 00 00', // xMin, yMin, xMax, yMax
      '00 00', // endPtsOfContours
      '00 00', // instructionLength
      '06', // flags X_SHORT_VECTOR, Y_SHORT_VECTOR
      '00 00', // xCoordinate, yCoordinate
    );

    const glyph = readGlyph(data);

    expect(glyph.type).toBe('simple');
  });

  it('reads composite glyph correctly', () => {
    const data = fromHexString(
      'ff ff', // numberOfContours = -1 //
      '00 00 00 00 00 00 00 00', // xMin, yMin, xMax, yMax
      '00 20', // flags = 0x0020
      '00 07', // glyphId = 1
      '00 00', // argument1, argument2
      '00 00', // flags
      '00 08', // glyphId = 2
      '00 00', // argument1, argument2
    );

    const glyph = readGlyph(data);

    expect(glyph.type).toBe('composite');
    expect((glyph as any).glyphIds).toEqual([7, 8]);
  });
});

describe('writeGlyph', () => {
  it('writes simple glyph correctly', () => {
    const data = fromHexString(
      '00 01', // numberOfContours = 1
      '00 00 00 00 00 00 00 00', // xMin, yMin, xMax, yMax
      '00 00', // endPtsOfContours
      '00 00', // instructionLength
      '06', // flags X_SHORT_VECTOR, Y_SHORT_VECTOR
      '00 00', // xCoordinate, yCoordinate
    );
    const glyph = readGlyph(data);
    const writer = new DataWriter();

    writeGlyph(glyph, writer);

    expect(toHexString(writer.getData())).toBe(
      '00 01 00 00 00 00 00 00 00 00 00 00 00 00 06 00 00',
    );
  });

  it('writes composite glyph correctly', () => {
    const data = fromHexString(
      'ff ff', // numberOfContours = -1 //
      '00 00 00 00 00 00 00 00', // xMin, yMin, xMax, yMax
      '00 20', // flags = 0x0020
      '00 07', // glyphId = 1
      '00 00', // argument1, argument2
      '00 00', // flags
      '00 08', // glyphId = 2
      '00 00', // argument1, argument2
    );
    const glyph = readGlyph(data);
    const writer = new DataWriter();

    writeGlyph(glyph, writer);

    expect(toHexString(writer.getData())).toBe(
      'ff ff 00 00 00 00 00 00 00 00 00 20 00 07 00 00 00 00 00 08 00 00',
    );
  });
});

describe('GlyfTableBuilder', () => {
  it('adds and writes glyphs correctly', () => {
    const glyph1 = readGlyph(
      fromHexString(
        'ff ff', // numberOfContours = -1 //
        '00 00 00 00 00 00 00 00', // xMin, yMin, xMax, yMax
        '00 20', // flags = 0x0020
        '00 07', // glyphId = 1
        '00 00', // argument1, argument2
        '00 00', // flags
        '00 08', // glyphId = 2
        '00 00',
      ),
    );
    const glyph2 = readGlyph(
      fromHexString(
        '00 01', // numberOfContours = 1
        '00 00 00 00 00 00 00 00', // xMin, yMin, xMax, yMax
        '00 00', // endPtsOfContours
        '00 00', // instructionLength
        '06', // flags X_SHORT_VECTOR, Y_SHORT_VECTOR
        '00 00',
      ),
    );
    const writer = new DataWriter();

    const builder = new GlyfTableBuilder([glyph1]);
    builder.addGlyph(glyph2);
    const { offsets } = builder.writeTable(writer);

    expect(offsets).toEqual([0, 24, 44]);
    expect(toHexString(writer.getData())).toBe(
      [
        'ff ff 00 00 00 00 00 00 00 00 00 20 00 07 00 00 00 00 00 08 00 00',
        '00 00', // padding
        '00 01 00 00 00 00 00 00 00 00 00 00 00 00 06 00 00',
        '00 00 00', //padding
      ].join(' '),
    );
  });
});
