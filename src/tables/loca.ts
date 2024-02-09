import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

import { HeadTable } from './head.ts';
import { MaxpTable } from './maxp.ts';

// There are two versions of this table: a short version, and a long version. The version is specified in the indexToLocFormat entry in the 'head' table.
// The value of n is numGlyphs + 1. The value for numGlyphs is found in the 'maxp' table.

export class LocaTable {
  offsets: number[];

  static read(data: DataView, head: HeadTable, maxp: MaxpTable): LocaTable {
    const long = head.indexToLocFormat === 1;
    const numGlyphs = maxp.numGlyphs;
    return new LocaTable(data, numGlyphs, long);
  }

  private constructor(data: DataView, numGlyphs: number, long?: boolean) {
    const reader = new DataReader(data);
    const read = long ? () => reader.readUint32() : () => reader.readUint16() << 1;
    this.offsets = Array.from({ length: numGlyphs + 1 }, read);
  }
}

export class LocaTableBuilder extends TableBuilder {
  format: 'short' | 'long';
  offsets: number[];

  static shortFormat(offsets?: number[]): LocaTableBuilder {
    return new LocaTableBuilder('short', offsets);
  }

  static longFormat(offsets?: number[]): LocaTableBuilder {
    return new LocaTableBuilder('long', offsets);
  }

  private constructor(format: 'short' | 'long', offsets?: number[]) {
    super('loca');
    this.format = format;
    this.offsets = offsets ?? [];
  }

  writeTable(writer: DataWriter): void {
    const write =
      this.format === 'long'
        ? (n: number) => writer.writeUint32(n)
        : (n: number) => writer.writeUint16(n >> 2);
    for (let i = 0, len = this.offsets.length; i < len; i++) {
      write(this.offsets[i]);
    }
  }
}
