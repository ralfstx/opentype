import { DataReader } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { TableBuilder } from '../table-builder.ts';

/**
 * The 'maxp' table contains the maximum values for various font-wide parameters.
 *
 * CFF fonts must use version 0.5 (only numGlyphs). TrueType fonts must
 * use version 1.0. All fields are required for version 1.0.
 */
export class MaxpTable {
  /** The version of the 'maxp' table. */
  readonly version: 0.5 | 1.0;
  /** The number of glyphs in the font. */
  readonly numGlyphs: number;

  /** Maximum points in a non-composite glyph. */
  readonly maxPoints: number | undefined;
  /** Maximum contours in a non-composite glyph. */
  readonly maxContours: number | undefined;
  /** Maximum points in a composite glyph. */
  readonly maxCompositePoints: number | undefined;
  /** Maximum contours in a composite glyph. */
  readonly maxCompositeContours: number | undefined;
  /** 1 if instructions do not use the twilight zone (Z0), or 2 if instructions do use Z0. */
  readonly maxZones: number | undefined;
  /** Maximum points used in Z0. */
  readonly maxTwilightPoints: number | undefined;
  /** Number of Storage Area locations. */
  readonly maxStorage: number | undefined;
  /** Number of FDEFs, equal to the highest function number + 1. */
  readonly maxFunctionDefs: number | undefined;
  /** Number of IDEFs. */
  readonly maxInstructionDefs: number | undefined;
  /** Maximum stack depth across Font Program. */
  readonly maxStackElements: number | undefined;
  /** Maximum byte count for glyph instructions. */
  readonly maxSizeOfInstructions: number | undefined;
  /** Maximum number of components referenced at “top level” for any composite glyph. */
  readonly maxComponentElements: number | undefined;
  /** Maximum levels of recursion; 1 for simple components. */
  readonly maxComponentDepth: number | undefined;

  /**
   * Reads a 'maxp' table from the given DataView.
   */
  static read(data: DataView): MaxpTable {
    return new MaxpTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);
    this.version = readVersion(reader);
    this.numGlyphs = reader.readUint16();

    if (this.version === 1.0) {
      this.maxPoints = reader.readUint16();
      this.maxContours = reader.readUint16();
      this.maxCompositePoints = reader.readUint16();
      this.maxCompositeContours = reader.readUint16();
      this.maxZones = reader.readUint16();
      this.maxTwilightPoints = reader.readUint16();
      this.maxStorage = reader.readUint16();
      this.maxFunctionDefs = reader.readUint16();
      this.maxInstructionDefs = reader.readUint16();
      this.maxStackElements = reader.readUint16();
      this.maxSizeOfInstructions = reader.readUint16();
      this.maxComponentElements = reader.readUint16();
      this.maxComponentDepth = reader.readUint16();
    }
  }
}

function readVersion(reader: DataReader): 0.5 | 1.0 {
  const version = reader.readUint32();
  if (version === 0x00005000) {
    return 0.5;
  }
  if (version === 0x00010000) {
    return 1.0;
  }
  throw new Error('Invalid maxp table version');
}

/**
 * Builder for the 'maxp' table.
 */
export class MaxpTableBuilder extends TableBuilder {
  readonly version: 0.5 | 1;
  numGlyphs: number;
  maxPoints: number | undefined;
  maxContours: number | undefined;
  maxCompositePoints: number | undefined;
  maxCompositeContours: number | undefined;
  maxZones: number | undefined;
  maxTwilightPoints: number | undefined;
  maxStorage: number | undefined;
  maxFunctionDefs: number | undefined;
  maxInstructionDefs: number | undefined;
  maxStackElements: number | undefined;
  maxSizeOfInstructions: number | undefined;
  maxComponentElements: number | undefined;
  maxComponentDepth: number | undefined;

  /**
   * Creates a builder for a 'maxp' table suitable for CFF fonts (version 0.5).
   */
  static forCFF(numGlyphs: number) {
    return new MaxpTableBuilder(0.5, numGlyphs);
  }

  /**
   * Creates a builder for a 'maxp' table suitable for TrueType fonts (version 1.0).
   */
  static forTTF(numGlyphs: number) {
    return new MaxpTableBuilder(1.0, numGlyphs);
  }

  /**
   * Creates a builder for a 'maxp' table based on an existing MaxpTable.
   */
  static forTable(table: MaxpTable): MaxpTableBuilder {
    const builder = new MaxpTableBuilder(table.version, table.numGlyphs);
    builder.maxPoints = table.maxPoints;
    builder.maxContours = table.maxContours;
    builder.maxCompositePoints = table.maxCompositePoints;
    builder.maxCompositeContours = table.maxCompositeContours;
    builder.maxZones = table.maxZones;
    builder.maxTwilightPoints = table.maxTwilightPoints;
    builder.maxStorage = table.maxStorage;
    builder.maxFunctionDefs = table.maxFunctionDefs;
    builder.maxInstructionDefs = table.maxInstructionDefs;
    builder.maxStackElements = table.maxStackElements;
    builder.maxSizeOfInstructions = table.maxSizeOfInstructions;
    builder.maxComponentElements = table.maxComponentElements;
    builder.maxComponentDepth = table.maxComponentDepth;
    return builder;
  }

  constructor(version: 0.5 | 1, numGlyphs: number) {
    super('maxp');
    this.version = version;
    this.numGlyphs = numGlyphs;
  }

  writeTable(writer: DataWriter): void {
    if (this.version === 0.5) {
      writer.writeUint32(0x00005000);
      writer.writeUint16(this.numGlyphs);
    } else {
      writer.writeUint32(0x00010000);
      writer.writeUint16(this.numGlyphs);
      writer.writeUint16(this.maxPoints ?? 0);
      writer.writeUint16(this.maxContours ?? 0);
      writer.writeUint16(this.maxCompositePoints ?? 0);
      writer.writeUint16(this.maxCompositeContours ?? 0);
      writer.writeUint16(this.maxZones ?? 0);
      writer.writeUint16(this.maxTwilightPoints ?? 0);
      writer.writeUint16(this.maxStorage ?? 0);
      writer.writeUint16(this.maxFunctionDefs ?? 0);
      writer.writeUint16(this.maxInstructionDefs ?? 0);
      writer.writeUint16(this.maxStackElements ?? 0);
      writer.writeUint16(this.maxSizeOfInstructions ?? 0);
      writer.writeUint16(this.maxComponentElements ?? 0);
      writer.writeUint16(this.maxComponentDepth ?? 0);
    }
  }
}
