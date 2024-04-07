import assert from 'node:assert';

import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

export class HeadTable {
  /** Use version string `NameId.versionString` in name table instead. */
  fontRevision: number;
  checksumAdjustment: number;
  /** Bit flags, see HeadFlags. */
  flags: number;
  /** Valid values range from 16 to 16384. Should be a power of 2 for TrueType fonts. */
  unitsPerEm: number;
  created: Date;
  modified: Date;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  /** Bit flags, see MacStyle. */
  macStyle: number;
  /** Smallest readable size in pixels. */
  lowestRecPPEM: number;
  /** Indicates the type of offset format used in the 'loca' table: 0: 16 bit, 1: 32 bit. */
  indexToLocFormat: number;

  static read(data: DataView): HeadTable {
    return new HeadTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    assert.equal(reader.readUint16(), 1, 'majorVersion should be 1');
    assert.equal(reader.readUint16(), 0, 'minorVersion should be 0');
    this.fontRevision = reader.readFixed();
    this.checksumAdjustment = reader.readUint32();
    assert.equal(reader.readUint32(), 0x5f0f3cf5, 'magicNumber should be 0x5f0f3cf5');
    this.flags = reader.readUint16();
    this.unitsPerEm = reader.readUint16();
    this.created = fromLongDateTime(reader.readUint32());
    this.modified = fromLongDateTime(reader.readUint32());
    this.xMin = reader.readInt16();
    this.yMin = reader.readInt16();
    this.xMax = reader.readInt16();
    this.yMax = reader.readInt16();
    this.macStyle = reader.readUint16();
    this.lowestRecPPEM = reader.readUint16();
    reader.readInt16(); // fontDirectionHint, deprecated
    this.indexToLocFormat = reader.readInt16();
    reader.readInt16(); // glyphDataFormat
  }
}

export class HeadTableBuilder extends TableBuilder {
  fontRevision;
  flags: number;
  unitsPerEm: number;
  created: Date;
  modified: Date;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  macStyle: number;
  lowestRecPPEM: number;
  /**
   * Indicates the type of offset format used in the 'loca' table: 0: 16 bit, 1: 32 bit
   */
  indexToLocFormat: number = 0;

  constructor(init?: HeadTable) {
    super('head');
    this.fontRevision = init?.fontRevision ?? 0;
    this.flags = init?.flags ?? 0;
    this.unitsPerEm = init?.unitsPerEm ?? 0;
    this.created = init?.created ?? new Date();
    this.modified = init?.modified ?? new Date();
    this.xMin = init?.xMin ?? 0;
    this.yMin = init?.yMin ?? 0;
    this.xMax = init?.xMax ?? 0;
    this.yMax = init?.yMax ?? 0;
    this.macStyle = init?.macStyle ?? 0;
    this.lowestRecPPEM = init?.lowestRecPPEM ?? 0;
    this.indexToLocFormat = init?.indexToLocFormat ?? 0;
  }

  writeTable(writer: DataWriter): void {
    writer.writeUint16(1); // majorVersion
    writer.writeUint16(0); // minorVersion
    writer.writeFixed(this.fontRevision);
    writer.writeUint32(0); // checksumAdjustment, must be 0, overwritten by font builder
    writer.writeUint32(0x5f0f3cf5); // magicNumber
    writer.writeUint16(this.flags);
    writer.writeUint16(this.unitsPerEm);
    writer.writeUint32(toLongDateTime(this.created ?? new Date()));
    writer.writeUint32(toLongDateTime(this.modified ?? new Date()));
    writer.writeInt16(this.xMin);
    writer.writeInt16(this.yMin);
    writer.writeInt16(this.xMax);
    writer.writeInt16(this.yMax);
    writer.writeUint16(this.macStyle);
    writer.writeUint16(this.lowestRecPPEM);
    writer.writeInt16(2); // fontDirectionHint
    writer.writeInt16(this.indexToLocFormat);
    writer.writeInt16(0); // glyphDataFormat
  }
}

export const MacStyle = {
  bold: 1 as const,
  italic: 2 as const,
  underline: 4 as const,
  outline: 8 as const,
  shadow: 16 as const,
  condensed: 32 as const,
  extended: 64 as const,
};

export const HeadFlags = {
  baselineAtY0: 1 as const,
  leftSideBearingAtX0: 2 as const,
  instructionsMayDependOnPointSize: 4 as const,
  forcePpemToIntegerValues: 8 as const,
  instructionsMayAlterAdvanceWidth: 16 as const,
  fontDataIsLossless: 2048 as const,
  fontConverted: 4096 as const,
  fontOptimizedForClearType: 8192 as const,
  lastResortFont: 16384 as const,
};

export function toLongDateTime(date: Date) {
  // number of seconds since 12:00 midnight, January 1, 1904, UTC
  return Math.floor(date.getTime() / 1000) + 2082844800;
}

export function fromLongDateTime(time: number) {
  // number of seconds since 12:00 midnight, January 1, 1904, UTC
  return new Date((time - 2082844800) * 1000);
}
