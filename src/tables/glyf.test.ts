import { describe, expect, it } from 'vitest';

import { DataWriter } from '../data-writer.ts';
import {
  type CompoundGlyph,
  GlyfTable,
  GlyfTableBuilder,
  readGlyph,
  writeGlyph,
} from '../tables/glyf.ts';
import { fromHexString, toHexString } from '../test-utils.ts';
import { type LocaTable } from './loca.ts';
import { type MaxpTable } from './maxp.ts';

describe('GlyfTable', () => {
  describe('read', () => {
    it('reads data', () => {
      const maxpTable = { numGlyphs: 2 } as MaxpTable;
      const locaTable = { offsets: [0, 10, 20] } as LocaTable;

      const glyfTable = GlyfTable.read(new DataView(new ArrayBuffer(30)), maxpTable, locaTable);

      expect(glyfTable.numGlyphs).toBe(2);
    });
  });

  describe('readGlyph', () => {
    it('throws error for out-of-bounds glyph ID', () => {
      const locaTable = { offsets: [0, 10, 20] } as LocaTable;
      const maxpTable = { numGlyphs: 2 } as MaxpTable;
      const glyfTable = GlyfTable.read(new DataView(new ArrayBuffer(30)), maxpTable, locaTable);

      expect(() => glyfTable.readGlyph(-1)).toThrow('Glyph ID -1 is out of bounds');
      expect(() => glyfTable.readGlyph(2)).toThrow('Glyph ID 2 is out of bounds');
    });

    it('returns correct Glyph for valid glyph ID', () => {
      const dummyData = new DataView(Uint8Array.from({ length: 30 }, (_, i) => i).buffer);
      const locaTable = { offsets: [0, 10, 20] } as LocaTable;
      const maxpTable = { numGlyphs: 2 } as MaxpTable;
      const glyfTable = GlyfTable.read(dummyData, maxpTable, locaTable);

      const glyph = glyfTable.readGlyph(1);

      expect(glyph.type).toBe('simple');
      expect(toHexString(glyph.data)).toBe('0a 0b 0c 0d 0e 0f 10 11 12 13');
    });
  });
});

describe('readGlyph', () => {
  it('reads simple glyph with empty data correctly', () => {
    const data = fromHexString();

    const glyph = readGlyph(data);

    expect(glyph.type).toBe('simple');
  });

  it('reads simple glyph with zero contours correctly', () => {
    const data = fromHexString(
      '00 00', // numberOfContours = 0
      '00 00 00 00 02 00 03 00', // xMin=0, yMin=0, xMax=512, yMax=768
    );

    const glyph = readGlyph(data);

    expect(glyph.type).toBe('simple');
  });

  it('reads simple glyph correctly', () => {
    const data = fromHexString(
      '00 02', // numberOfContours = 2
      '00 0a 00 14 01 f4 02 58', // xMin=10, yMin=20, xMax=500, yMax=600
      '00 01 00 03', // endPtsOfContours = [1, 3] (4 points total)
      '00 02', // instructionLength = 2
      'b0 01', // instructions (PUSHB, 1)
      '06 06 06 06', // flags for 4 points (X_SHORT_VECTOR, Y_SHORT_VECTOR)
      '0a 1e 32 46', // x coordinates (10, 30, 50, 70)
      '14 28 3c 50', // y coordinates (20, 40, 60, 80)
    );

    const glyph = readGlyph(data);

    expect(glyph.type).toBe('simple');
  });

  it('reads composite glyph correctly', () => {
    const data = fromHexString(
      'ff ff', // numberOfContours = -1
      '00 32 00 64 02 bc 03 20', // xMin=50, yMin=100, xMax=700, yMax=800
      '00 21', // flags = 0x0021 (MORE_COMPONENTS | ARG_1_AND_2_ARE_WORDS)
      '00 07', // glyphId = 7
      '00 c8 00 96', // argument1=200, argument2=150 (word offsets)
      '00 00', // flags = 0x0000 (last component)
      '00 08', // glyphId = 8
      '1e 0a', // argument1=30, argument2=10 (byte offsets)
    );

    const glyph = readGlyph(data);

    expect(glyph.type).toBe('composite');
    expect((glyph as CompoundGlyph).glyphIds).toEqual([7, 8]);
  });

  it('reads composite glyph with scale correctly', () => {
    const data = fromHexString(
      'ff ff', // numberOfContours = -1
      '00 00 00 00 01 00 01 00', // xMin=0, yMin=0, xMax=256, yMax=256
      '00 08', // flags = 0x0008 (WE_HAVE_A_SCALE)
      '00 03', // glyphId = 3
      '00 00', // argument1=0, argument2=0
      '40 00', // scale = 1.0 (F2Dot14 format)
    );

    const glyph = readGlyph(data);

    expect(glyph.type).toBe('composite');
    expect((glyph as CompoundGlyph).glyphIds).toEqual([3]);
  });
});

describe('writeGlyph', () => {
  it('does not write glyph with empty data', () => {
    const data = fromHexString();
    const glyph = readGlyph(data);
    const writer = new DataWriter();

    writeGlyph(glyph, writer);

    expect(writer.getData().byteLength).toBe(0);
  });

  it('writes simple glyph with zero contours correctly', () => {
    // A glyph with zero contours has a bounding box but no points (e.g., space glyph with metrics)
    const data = fromHexString(
      '00 00', // numberOfContours = 0
      '00 00 00 00 02 00 03 00', // xMin=0, yMin=0, xMax=512, yMax=768
    );
    const glyph = readGlyph(data);
    const writer = new DataWriter();

    writeGlyph(glyph, writer);

    expect(toHexString(writer.getData())).toBe('00 00 00 00 00 00 02 00 03 00');
  });

  it('writes simple glyph correctly', () => {
    const data = fromHexString(
      '00 02', // numberOfContours = 2
      '00 0a 00 14 01 f4 02 58', // xMin=10, yMin=20, xMax=500, yMax=600
      '00 01 00 02', // endPtsOfContours = [1, 2] (3 points total)
      '00 03', // instructionLength = 3
      'b0 40 01', // instructions
      '06 06 06', // flags for 3 points
      '0a 1e 32', // x coordinates (10, 30, 50)
      '14 28 3c', // y coordinates (20, 40, 60)
    );
    const glyph = readGlyph(data);
    const writer = new DataWriter();

    writeGlyph(glyph, writer);

    expect(toHexString(writer.getData())).toBe(
      '00 02 00 0a 00 14 01 f4 02 58 00 01 00 02 00 03 b0 40 01 06 06 06 0a 1e 32 14 28 3c',
    );
  });

  it('writes simple glyph with repeated flags correctly', () => {
    // Test that REPEAT_FLAG (0x08) is handled correctly during read and write
    const data = fromHexString(
      '00 01', // numberOfContours = 1
      '00 02 00 03 00 64 00 65', // xMin, yMin, xMax, yMax
      '00 02', // endPtsOfContours = 2 (3 points: 0, 1, 2)
      '00 00', // instructionLength = 0
      '06', // flags[0] = 0x06 (X_SHORT_VECTOR, Y_SHORT_VECTOR)
      '0e 01', // flags[1,2] = 0x0e (X_SHORT_VECTOR, Y_SHORT_VECTOR, REPEAT_FLAG) with repeatCount=1
      '00 32 32', // x coordinates (short)
      '00 32 32', // y coordinates (short)
    );
    const glyph = readGlyph(data);
    const writer = new DataWriter();

    writeGlyph(glyph, writer);

    // Output should preserve the repeated flags format
    expect(toHexString(writer.getData())).toBe(
      '00 01 00 02 00 03 00 64 00 65 00 02 00 00 06 0e 01 00 32 32 00 32 32',
    );
  });

  it('writes composite glyph correctly', () => {
    const data = fromHexString(
      'ff ff', // numberOfContours = -1
      '00 32 00 64 02 bc 03 20', // xMin=50, yMin=100, xMax=700, yMax=800
      '00 21', // flags = 0x0021 (MORE_COMPONENTS | ARG_1_AND_2_ARE_WORDS)
      '00 07', // glyphId = 7
      '00 c8 00 96', // argument1=200, argument2=150 (word offsets)
      '00 00', // flags = 0x0000 (last component)
      '00 08', // glyphId = 8
      '1e 0a', // argument1=30, argument2=10 (byte offsets)
    );
    const glyph = readGlyph(data);
    const writer = new DataWriter();

    writeGlyph(glyph, writer);

    expect(toHexString(writer.getData())).toBe(
      'ff ff 00 32 00 64 02 bc 03 20 00 21 00 07 00 c8 00 96 00 00 00 08 1e 0a',
    );
  });

  it('writes composite glyph with scale correctly', () => {
    const data = fromHexString(
      'ff ff', // numberOfContours = -1
      '00 00 00 00 01 00 01 00', // xMin=0, yMin=0, xMax=256, yMax=256
      '00 08', // flags = 0x0008 (WE_HAVE_A_SCALE)
      '00 03', // glyphId = 3
      '00 00', // argument1=0, argument2=0
      '40 00', // scale = 1.0 (F2Dot14 format)
    );
    const glyph = readGlyph(data);
    const writer = new DataWriter();

    writeGlyph(glyph, writer);

    expect(toHexString(writer.getData())).toBe(
      'ff ff 00 00 00 00 01 00 01 00 00 08 00 03 00 00 40 00',
    );
  });

  it('writes composite glyph with glyph ID mapper correctly', () => {
    const data = fromHexString(
      'ff ff', // numberOfContours = -1
      '00 00 00 00 01 00 01 00', // xMin=0, yMin=0, xMax=256, yMax=256
      '00 20', // flags = 0x0020 (MORE_COMPONENTS)
      '00 05', // glyphId = 5
      '0a 14', // argument1=10, argument2=20
      '00 00', // flags = 0x0000 (last component)
      '00 0a', // glyphId = 10
      '1e 28', // argument1=30, argument2=40
    );
    const glyph = readGlyph(data);
    const writer = new DataWriter();
    const mapper = (id: number) => id + 100; // Map glyph IDs by adding 100

    writeGlyph(glyph, writer, mapper);

    // Glyph IDs should be remapped: 5 -> 105, 10 -> 110
    expect(toHexString(writer.getData())).toBe(
      'ff ff 00 00 00 00 01 00 01 00 00 20 00 69 0a 14 00 00 00 6e 1e 28',
    );
  });
});

describe('GlyfTableBuilder', () => {
  it('adds and writes glyphs correctly', () => {
    const glyph1 = readGlyph(
      fromHexString(
        'ff ff', // numberOfContours = -1 (composite)
        '00 32 00 64 02 bc 03 20', // xMin=50, yMin=100, xMax=700, yMax=800
        '00 20', // flags = 0x0020 (MORE_COMPONENTS)
        '00 07', // glyphId = 7
        '00 00', // argument1, argument2
        '00 00', // flags = 0x0000 (last component)
        '00 08', // glyphId = 8
        '00 00', // argument1, argument2
      ),
    );
    const glyph2 = readGlyph(
      fromHexString(
        '00 01', // numberOfContours = 1 (simple)
        '00 0a 00 14 00 c8 00 fa', // xMin=10, yMin=20, xMax=200, yMax=250
        '00 00', // endPtsOfContours = [0] (1 point)
        '00 00', // instructionLength = 0
        '06', // flags (X_SHORT_VECTOR, Y_SHORT_VECTOR)
        '64 c8', // x=100, y=200
      ),
    );
    const writer = new DataWriter();

    const builder = new GlyfTableBuilder([glyph1, glyph2]);
    builder.writeTable(writer);

    expect([...builder.offsets()]).toEqual([0, 24, 44]);
    expect(toHexString(writer.getData())).toBe(
      [
        'ff ff 00 32 00 64 02 bc 03 20 00 20 00 07 00 00 00 00 00 08 00 00',
        '00 00', // padding to 4-byte boundary
        '00 01 00 0a 00 14 00 c8 00 fa 00 00 00 00 06 64 c8',
        '00 00 00', // padding to 4-byte boundary
      ].join(' '),
    );
  });

  it('handles empty glyphs correctly', () => {
    const emptyGlyph = readGlyph(fromHexString());
    const simpleGlyph = readGlyph(
      fromHexString(
        '00 01', // numberOfContours = 1
        '00 00 00 00 00 64 00 64', // xMin=0, yMin=0, xMax=100, yMax=100
        '00 00', // endPtsOfContours = [0]
        '00 00', // instructionLength = 0
        '06', // flags
        '32 32', // x=50, y=50
      ),
    );
    const writer = new DataWriter();

    const builder = new GlyfTableBuilder([emptyGlyph, simpleGlyph]);
    builder.writeTable(writer);

    // Empty glyph takes no space, offsets should reflect this
    expect([...builder.offsets()]).toEqual([0, 0, 20]);
    expect(toHexString(writer.getData())).toBe(
      ['00 01', '00 00 00 00 00 64 00 64', '00 00', '00 00', '06', '32 32', '00 00 00'].join(' '),
    );
  });
});
