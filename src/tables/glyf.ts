import { DataReader, subDataView } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { TableBuilder } from '../table-builder.ts';
import { type LocaTable } from './loca.ts';
import { type MaxpTable } from './maxp.ts';

/**
 * Represents a simple glyph in the 'glyf' table.
 */
export type SimpleGlyph = {
  /** The type of the glyph, either 'simple' or 'composite'. */
  readonly type: 'simple';
  /** The raw glyph data. */
  readonly data: DataView;
};

/**
 * Represents a compound glyph in the 'glyf' table.
 */
export type CompoundGlyph = {
  /** The type of the glyph, either 'simple' or 'composite'. */
  readonly type: 'composite';
  /** The IDs of the component glyphs. */
  readonly glyphIds: ReadonlyArray<number>;
  /** The raw glyph data. */
  readonly data: DataView;
};

export type Glyph = SimpleGlyph | CompoundGlyph;

/**
 * The 'glyf' table contains the outline data for TrueType glyphs.
 */
export class GlyfTable {
  private readonly data: DataView;
  private readonly offsets: number[];

  /**
   * The number of glyphs in the 'glyf' table.
   */
  readonly numGlyphs: number;

  /**
   * Reads a 'glyf' table from the given DataView.
   */
  static read(data: DataView, maxp: MaxpTable, loca: LocaTable): GlyfTable {
    return new GlyfTable(data, maxp.numGlyphs, loca.offsets);
  }

  private constructor(data: DataView, numGlyphs: number, offsets: number[]) {
    this.data = data;
    this.offsets = offsets;
    this.numGlyphs = numGlyphs;
  }

  /**
   * Retrieves the glyph data for the specified glyph ID.
   */
  readGlyph(glyphId: number): Glyph {
    if (glyphId < 0 || glyphId >= this.numGlyphs) {
      throw new Error(`Glyph ID ${glyphId} is out of bounds`);
    }

    const offset = this.offsets[glyphId];
    if (offset === -1) {
      throw new Error(`Glyph ID ${glyphId} is not defined`);
    }

    const nextOffset = this.offsets[glyphId + 1];
    if (nextOffset === -1) {
      throw new Error(`Glyph ID ${glyphId} is not defined`);
    }

    const length = nextOffset - offset;
    return readGlyph(subDataView(this.data, offset, length));
  }
}

/**
 * Builder for the 'glyf' table.
 */
export class GlyfTableBuilder extends TableBuilder {
  private readonly glyphs: ReadonlyArray<Glyph>;
  private readonly glyphIdMap: ReadonlyMap<number, number> | undefined;
  private readonly skipInstructions: boolean | undefined;
  private _writtenOffsets: number[] = [];

  /**
   * Creates a new GlyfTableBuilder for the given glyphs.
   */
  constructor(
    glyphs: ReadonlyArray<Glyph>,
    opts?: { glyphIdMap?: ReadonlyMap<number, number>; skipInstructions?: boolean },
  ) {
    super('glyf');
    this.glyphs = [...glyphs];
    this.glyphIdMap = opts?.glyphIdMap;
    this.skipInstructions = opts?.skipInstructions;
  }

  /**
   * The number of glyphs in the 'glyf' table.
   */
  get numGlyphs(): number {
    return this.glyphs.length;
  }

  /**
   * The array of offsets for each glyph, including an extra entry for
   * the end of the table. Only valid after writing the table.
   */
  get writtenOffsets(): readonly number[] {
    return this._writtenOffsets.slice();
  }

  writeTable(writer: DataWriter): void {
    this._writtenOffsets.length = 0;
    const start = writer.position;

    for (const glyph of this.glyphs) {
      this._writtenOffsets.push(writer.position - start);

      writeGlyph(glyph, writer, { glyphIdMap: this.glyphIdMap, skipInstructions: this.skipInstructions });

      // Add padding to ensure each glyph ends on a 4-byte boundary
      const padding = (4 - (writer.position % 4)) % 4;
      for (let i = 0; i < padding; i++) {
        writer.writeUint8(0);
      }
    }

    this._writtenOffsets.push(writer.position - start);
  }
}

/**
 * Reads a glyph from the given DataView.
 */
export function readGlyph(data: DataView): Glyph {
  if (data.byteLength === 0) {
    return { type: 'simple', data };
  }

  const reader = new DataReader(data);
  const numberOfContours = reader.readInt16();
  if (numberOfContours >= 0) {
    // Simple glyph

    return { type: 'simple', data };
  }

  // Compound glyph
  const glyphIds = [];

  reader.readInt16(); // xMin
  reader.readInt16(); // yMin
  reader.readInt16(); // xMax
  reader.readInt16(); // yMax

  let flags: number;
  do {
    flags = reader.readUint16();
    glyphIds.push(reader.readUint16());

    if (flags & 0x0001) {
      // ARG_1_AND_2_ARE_WORDS
      reader.readInt16();
      reader.readInt16();
    } else {
      reader.readInt8();
      reader.readInt8();
    }

    if (flags & 0x0008) {
      // WE_HAVE_A_SCALE
      reader.readInt16();
    } else if (flags & 0x0040) {
      // WE_HAVE_AN_X_AND_Y_SCALE
      reader.readInt16();
      reader.readInt16();
    } else if (flags & 0x0080) {
      // WE_HAVE_A_TWO_BY_TWO
      reader.readInt16();
      reader.readInt16();
      reader.readInt16();
      reader.readInt16();
    }
  } while (flags & 0x0020); // MORE_COMPONENTS

  return {
    type: 'composite',
    data,
    glyphIds,
  };
}

/**
 * Writes a glyph to the given DataWriter.
 */
export function writeGlyph(
  glyph: Glyph,
  writer: DataWriter,
  opts?: { glyphIdMap?: ReadonlyMap<number, number>; skipInstructions?: boolean },
): void {
  if (glyph.data.byteLength === 0) {
    return;
  }

  const reader = new DataReader(glyph.data);
  const numberOfContours = reader.readInt16();
  writer.writeInt16(numberOfContours);

  const xMin = reader.readInt16();
  const yMin = reader.readInt16();
  const xMax = reader.readInt16();
  const yMax = reader.readInt16();

  writer.writeInt16(xMin);
  writer.writeInt16(yMin);
  writer.writeInt16(xMax);
  writer.writeInt16(yMax);

  if (numberOfContours >= 0) {
    // Simple glyph (including zero contours)
    if (numberOfContours === 0) {
      return;
    }

    const endPtsOfContours = Array.from({ length: numberOfContours }, () => reader.readUint16());
    for (const endPt of endPtsOfContours) {
      writer.writeUint16(endPt);
    }

    const instructionLength = reader.readUint16();
    writer.writeUint16(opts?.skipInstructions ? 0 : instructionLength);
    for (let i = 0; i < instructionLength; i++) {
      const instructionData = reader.readUint8();
      if (!opts?.skipInstructions) {
        writer.writeUint8(instructionData);
      }
    }

    const numPoints = endPtsOfContours[endPtsOfContours.length - 1] + 1;

    // Read flags - they can be repeated when REPEAT_FLAG (0x08) is set
    const flags: number[] = [];
    while (flags.length < numPoints) {
      const flag = reader.readUint8();
      flags.push(flag);
      if (flag & 0x08) {
        // REPEAT_FLAG
        const repeatCount = reader.readUint8();
        for (let j = 0; j < repeatCount; j++) {
          flags.push(flag);
        }
      }
    }

    // Write flags back in compressed form
    for (let i = 0; i < numPoints;) {
      const flag = flags[i];
      writer.writeUint8(flag);
      if (flag & 0x08) {
        // Count repeats
        let repeatCount = 0;
        while (i + 1 + repeatCount < numPoints && flags[i + 1 + repeatCount] === flag) {
          repeatCount++;
        }
        writer.writeUint8(repeatCount);
        i += 1 + repeatCount;
      } else {
        i++;
      }
    }

    for (let i = 0; i < numPoints; i++) {
      if (flags[i] & 0x02) {
        // X_SHORT_VECTOR
        writer.writeUint8(reader.readUint8());
      } else if (!(flags[i] & 0x10)) {
        writer.writeInt16(reader.readInt16());
      }
    }

    for (let i = 0; i < numPoints; i++) {
      if (flags[i] & 0x04) {
        // Y_SHORT_VECTOR
        writer.writeUint8(reader.readUint8());
      } else if (!(flags[i] & 0x20)) {
        writer.writeInt16(reader.readInt16());
      }
    }
  } else {
    // Composite glyph

    let flags;
    do {
      flags = reader.readUint16();

      // Skip WE_HAVE_INSTRUCTIONS flag if skipping instructions
      writer.writeUint16(opts?.skipInstructions ? flags & ~0x0100 : flags);

      const originalGlyphId = reader.readUint16();
      const mappedGlyphId = opts?.glyphIdMap?.get(originalGlyphId) ?? originalGlyphId;
      writer.writeUint16(mappedGlyphId);

      if (flags & 0x0001) {
        // ARG_1_AND_2_ARE_WORDS
        writer.writeInt16(reader.readInt16());
        writer.writeInt16(reader.readInt16());
      } else {
        writer.writeInt8(reader.readInt8());
        writer.writeInt8(reader.readInt8());
      }

      if (flags & 0x0008) {
        // WE_HAVE_A_SCALE
        writer.writeInt16(reader.readInt16());
      } else if (flags & 0x0040) {
        // WE_HAVE_AN_X_AND_Y_SCALE
        writer.writeInt16(reader.readInt16());
        writer.writeInt16(reader.readInt16());
      } else if (flags & 0x0080) {
        // WE_HAVE_A_TWO_BY_TWO
        writer.writeInt16(reader.readInt16());
        writer.writeInt16(reader.readInt16());
        writer.writeInt16(reader.readInt16());
        writer.writeInt16(reader.readInt16());
      }

      if (flags & 0x0100) {
        // WE_HAVE_INSTRUCTIONS
        const instructionLength = reader.readUint16();
        if (!opts?.skipInstructions) {
          writer.writeUint16(instructionLength);
        }
        for (let i = 0; i < instructionLength; i++) {
          const instructionData = reader.readUint8();
          if (!opts?.skipInstructions) {
            writer.writeUint8(instructionData);
          }
        }
      }
    } while (flags & 0x0020); // MORE_COMPONENTS
  }
}
