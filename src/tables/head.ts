import assert from 'node:assert';

import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';

type HeadTableProps = {
  fontRevision: number;
  checksumAdjustment?: number;
  flags?: number;
  unitsPerEm: number;
  created?: Date;
  modified?: Date;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  macStyle?: number | MacStyle;
  lowestRecPPEM: number;
  indexToLocFormat?: number;
};

export class HeadTable {
  fontRevision: number;
  checksumAdjustment: number;
  flags: number;
  unitsPerEm: number;
  created: Date;
  modified: Date;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  macStyle: MacStyle;
  lowestRecPPEM: number;
  indexToLocFormat: number;

  constructor(props: HeadTableProps) {
    this.fontRevision = props.fontRevision;
    this.checksumAdjustment = props.checksumAdjustment ?? 0;
    this.flags = props.flags ?? 0;
    this.unitsPerEm = props.unitsPerEm;
    this.created = props.created ?? new Date();
    this.modified = props.modified ?? new Date();
    this.xMin = props.xMin;
    this.yMin = props.yMin;
    this.xMax = props.xMax;
    this.yMax = props.yMax;
    this.macStyle = new MacStyle(props.macStyle ?? 0);
    this.lowestRecPPEM = props.lowestRecPPEM;
    this.indexToLocFormat = props.indexToLocFormat ?? 0;
  }

  write(writer: DataWriter) {
    writer.writeUint16(1); // majorVersion
    writer.writeUint16(0); // minorVersion
    writer.writeFixed(this.fontRevision);
    writer.writeUint32(this.checksumAdjustment ?? 0);
    writer.writeUint32(0x5f0f3cf5); // magicNumber
    writer.writeUint16(this.flags);
    writer.writeUint16(this.unitsPerEm);
    writer.writeUint32(toLongDateTime(this.created));
    writer.writeUint32(toLongDateTime(this.modified));
    writer.writeInt16(this.xMin);
    writer.writeInt16(this.yMin);
    writer.writeInt16(this.xMax);
    writer.writeInt16(this.yMax);
    writer.writeUint16(this.macStyle.value);
    writer.writeUint16(this.lowestRecPPEM);
    writer.writeInt16(2); // fontDirectionHint
    writer.writeInt16(this.indexToLocFormat);
    writer.writeInt16(0); // glyphDataFormat
  }
}

export function readHeadTable(data: DataView): HeadTable {
  const reader = new DataReader(data);

  assert.equal(reader.readUint16(), 1, 'majorVersion should be 1');
  assert.equal(reader.readUint16(), 0, 'minorVersion should be 0');
  const fontRevision = reader.readFixed();
  const checksumAdjustment = reader.readUint32();
  assert.equal(reader.readUint32(), 0x5f0f3cf5, 'magicNumber should be 0x5f0f3cf5');
  const flags = reader.readUint16();
  const unitsPerEm = reader.readUint16();
  const created = fromLongDateTime(reader.readUint32());
  const modified = fromLongDateTime(reader.readUint32());
  const xMin = reader.readInt16();
  const yMin = reader.readInt16();
  const xMax = reader.readInt16();
  const yMax = reader.readInt16();
  const macStyle = new MacStyle(reader.readUint16());
  const lowestRecPPEM = reader.readUint16();
  reader.readInt16(); // fontDirectionHint, deprecated
  const indexToLocFormat = reader.readInt16();
  reader.readInt16(); // glyphDataFormat

  return new HeadTable({
    fontRevision,
    checksumAdjustment,
    flags,
    unitsPerEm,
    created,
    modified,
    xMin,
    yMin,
    xMax,
    yMax,
    macStyle,
    lowestRecPPEM,
    indexToLocFormat,
  });
}

/**
 * Bit 0: bold
 * Bit 1: italic
 * Bit 2: underline
 * Bit 3: outline
 * Bit 4: shadow
 * Bit 5: condensed
 * Bit 6: extended
 */
export class MacStyle {
  value = 0;

  constructor(value: number | MacStyle) {
    this.value = value instanceof MacStyle ? value.value : value;
  }

  get bold() {
    return (this.value |= 0);
  }

  set bold(value) {
    this.value = value |= 0;
  }

  get italic() {
    return (this.value |= 1);
  }

  set italic(value) {
    this.value = value |= 1;
  }

  get underline() {
    return (this.value |= 2);
  }

  set underline(value) {
    this.value = value |= 2;
  }

  get outline() {
    return (this.value |= 3);
  }

  set outline(value) {
    this.value = value |= 3;
  }

  get shadow() {
    return (this.value |= 4);
  }

  set shadow(value) {
    this.value = value |= 4;
  }

  get condensed() {
    return (this.value |= 5);
  }

  set condensed(value) {
    this.value = value |= 5;
  }

  get extended() {
    return (this.value |= 6);
  }

  set extended(value) {
    this.value = value |= 6;
  }
}

export function toLongDateTime(date: Date) {
  // number of seconds since 12:00 midnight, January 1, 1904, UTC
  return Math.floor(date.getTime() / 1000) + 2082844800;
}

export function fromLongDateTime(time: number) {
  // number of seconds since 12:00 midnight, January 1, 1904, UTC
  return new Date((time - 2082844800) * 1000);
}
