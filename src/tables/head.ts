import assert from 'node:assert';

import { DataReader } from 'src/data-reader.ts';

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

  constructor(data: DataView) {
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

export function readHeadTable(data: DataView): HeadTable {
  return new HeadTable(data);
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
