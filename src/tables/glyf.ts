import { DataReader, subDataView } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { TableBuilder } from '../table-builder.ts';
import { type LocaTable } from './loca.ts';
import { type MaxpTable } from './maxp.ts';

/**
 * The 'glyf' table contains the outline data for TrueType glyphs.
 */
export class GlyfTable {
  readonly #data: DataView;
  readonly numGlyphs: number;
  readonly offsets: number[];

  /**
   * Reads a 'glyf' table from the given DataView.
   */
  static read(data: DataView, maxp: MaxpTable, loca: LocaTable): GlyfTable {
    return new GlyfTable(data, maxp.numGlyphs, loca.offsets);
  }

  private constructor(data: DataView, numGlyphs: number, offsets: number[]) {
    this.#data = data;
    this.offsets = offsets;
    this.numGlyphs = numGlyphs;
  }

  /**
   * Retrieves the glyph data for the specified glyph ID.
   */
  getGlyphData(glyphId: number): DataView {
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
    return subDataView(this.#data, offset, length);
  }
}

/**
 * Represents a simple glyph in the 'glyf' table.
 */
export type SimpleGlyph = {
  type: 'simple';
  data: DataView;
};

/**
 * Represents a compound glyph in the 'glyf' table.
 */
export type CompoundGlyph = {
  type: 'composite';
  data: DataView;
  glyphIds: number[];
};

export type Glyph = SimpleGlyph | CompoundGlyph;

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
  glyphIdMapper?: (glyphId: number) => number,
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

  if (numberOfContours > 0) {
    // Simple glyph

    const instructionLength = reader.readUint16();
    writer.writeUint16(instructionLength);
    for (let i = 0; i < instructionLength; i++) {
      writer.writeUint8(reader.readUint8());
    }

    const endPtsOfContours = Array.from({ length: numberOfContours }, () => reader.readUint16());
    for (const endPt of endPtsOfContours) {
      writer.writeUint16(endPt);
    }

    const numPoints = endPtsOfContours[endPtsOfContours.length - 1] + 1;
    const flags = Array.from({ length: numPoints }, () => reader.readUint8());
    for (const flag of flags) {
      writer.writeUint8(flag);
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
      writer.writeUint16(flags);

      const originalGlyphId = reader.readUint16();
      const mappedGlyphId = glyphIdMapper?.(originalGlyphId) ?? originalGlyphId;
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
        writer.writeUint16(instructionLength);
        for (let i = 0; i < instructionLength; i++) {
          writer.writeUint8(reader.readUint8());
        }
      }
    } while (flags & 0x0020); // MORE_COMPONENTS
  }
}

/**
 * Builder for the 'glyf' table.
 */
export class GlyfTableBuilder extends TableBuilder {
  private glyphs: Glyph[] = [];

  /**
   * Creates a new GlyfTableBuilder.
   */
  constructor(glyphs?: Glyph[]) {
    super('glyf');
    this.glyphs = glyphs?.slice() ?? [];
  }

  /**
   * Adds a glyph to the glyf table.
   */
  addGlyph(glyph: Glyph): void {
    this.glyphs.push(glyph);
  }

  writeTable(writer: DataWriter): { offsets: number[] } {
    const offsets: number[] = [];

    for (const glyph of this.glyphs) {
      offsets.push(writer.position);
      writeGlyph(glyph, writer);

      // Add padding to ensure each glyph ends on a 4-byte boundary
      const padding = (4 - (writer.position % 4)) % 4;
      for (let i = 0; i < padding; i++) {
        writer.writeUint8(0);
      }
    }

    // Add another offset to indicate the end of the table
    offsets.push(writer.position);

    return { offsets };
  }
}
