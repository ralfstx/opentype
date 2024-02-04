import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

import { HeadTable, toLongDateTime } from './head.ts';

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
