import { DataReader } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { standardGlyphs } from '../mac-roman.ts';
import { TableBuilder } from '../table-builder.ts';

export type PostTableVersion = 'v1.0' | 'v2.0' | 'v2.5' | 'v3.0';

/**
 * The `post` table contains information needed to use a TrueType font on a PostScript printer.
 * It provides PostScript glyph names, primarily for PostScript printers and older workflows.
 */
export abstract class PostTable {
  abstract readonly version: PostTableVersion;
  readonly italicAngle: number;
  readonly underlinePosition: number;
  readonly underlineThickness: number;
  readonly isFixedPitch: number;
  readonly minMemType42: number;
  readonly maxMemType42: number;
  readonly minMemType1: number;
  readonly maxMemType1: number;

  /**
   * Reads a `post` table from the given DataView.
   */
  static read(data: DataView): PostTable {
    const reader = new DataReader(data);
    const version = reader.readUint32();
    if (version === 0x00010000) {
      return new PostTableV10(reader);
    }
    if (version === 0x00020000) {
      return new PostTableV20(reader);
    }
    if (version === 0x00025000) {
      return new PostTableV25(reader);
    }
    if (version === 0x00030000) {
      return new PostTableV30(reader);
    }
    throw new Error(`Unsupported post table version: ${version}`);
  }

  protected constructor(reader: DataReader) {
    this.italicAngle = reader.readFixed();
    this.underlinePosition = reader.readUint16();
    this.underlineThickness = reader.readUint16();
    this.isFixedPitch = reader.readUint32();
    this.minMemType42 = reader.readUint32();
    this.maxMemType42 = reader.readUint32();
    this.minMemType1 = reader.readUint32();
    this.maxMemType1 = reader.readUint32();
  }

  /**
   * Get the glyph name for the given glyph index or `undefined` if the glyph name is not available.
   */
  abstract getGlyphName(index: number): string | undefined;
}

/**
 * `post` table version 1.0: Standard Macintosh glyph names only.
 */
export class PostTableV10 extends PostTable {
  readonly version = 'v1.0' as const;

  constructor(reader: DataReader) {
    super(reader);
  }

  getGlyphName(index: number): string | undefined {
    return standardGlyphs[index];
  }
}

/**
 * `post` table version 2.0: Macintosh glyph names with custom names.
 */
export class PostTableV20 extends PostTable {
  #reader: DataReader;
  #glyphNamesStart: number;
  #glyphNames?: string[];

  readonly version = 'v2.0' as const;

  /** Number of glyphs, should be the same as `numGlyphs` in the `maxp` table */
  readonly numGlyphs: number;
  /** Indices into the string data */
  readonly glyphNameIndex: number[];

  constructor(reader: DataReader) {
    super(reader);
    this.#reader = reader;
    this.numGlyphs = reader.readUint16();
    this.glyphNameIndex = Array.from({ length: this.numGlyphs }, () => reader.readUint16());
    this.#glyphNamesStart = this.#reader.position;
  }

  get glyphNames(): string[] {
    if (!this.#glyphNames) {
      this.#glyphNames = [];
      this.#reader.seek(this.#glyphNamesStart);
      while (this.#reader.position < this.#reader.data.byteLength) {
        const length = this.#reader.readInt8();
        const name = this.#reader.readAscii(length);
        this.#glyphNames.push(name);
      }
    }
    return this.#glyphNames;
  }

  getGlyphName(index: number): string | undefined {
    const id = this.glyphNameIndex[index];
    if (id < 258) {
      return standardGlyphs[id];
    }
    return this.glyphNames[id - 258];
  }
}

/**
 * `post` table version 2.5: Macintosh glyph names with offsets.
 */
export class PostTableV25 extends PostTable {
  readonly version = 'v2.5' as const;
  readonly numGlyphs: number;
  readonly offsets: number[];

  constructor(reader: DataReader) {
    super(reader);
    this.numGlyphs = reader.readUint16();
    this.offsets = Array.from({ length: this.numGlyphs }, () => reader.readInt8()); // Difference between graphic index and standard order of glyph
  }

  getGlyphName(index: number): string | undefined {
    return standardGlyphs[index + this.offsets[index]];
  }
}

/**
 * `post` table version 3.0: No glyph names.
 */
export class PostTableV30 extends PostTable {
  readonly version = 'v3.0' as const;

  constructor(reader: DataReader) {
    super(reader);
  }

  getGlyphName(): string | undefined {
    return undefined;
  }
}

/**
 * TableBuilder for `post` table version 3.0 (no glyph names).
 * This is the preferred format for PDF font embedding.
 */
export class PostTableBuilderV30 extends TableBuilder {
  private table: PostTable;

  constructor(table: PostTable) {
    super('post');
    this.table = table;
  }

  writeTable(writer: DataWriter): void {
    writer.writeUint32(0x00030000); // version
    writer.writeFixed(this.table.italicAngle);
    writer.writeUint16(this.table.underlinePosition);
    writer.writeUint16(this.table.underlineThickness);
    writer.writeUint32(this.table.isFixedPitch);
    writer.writeUint32(this.table.minMemType42);
    writer.writeUint32(this.table.maxMemType42);
    writer.writeUint32(this.table.minMemType1);
    writer.writeUint32(this.table.maxMemType1);
  }
}
