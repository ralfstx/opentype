import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

export class FontBuilder {
  sfntVersion: number;
  #tables: TableBuilder[];

  constructor() {
    this.sfntVersion = 0x00010000;
    this.#tables = [];
  }

  addTable(builder: TableBuilder): this {
    this.#tables.push(builder);
    return this;
  }

  build() {
    const writer = new DataWriter();
    const numTables = this.#tables.length;

    writer.writeUint32(this.sfntVersion);
    writer.writeUint16(numTables);
    const searchRange = 2 ** (Math.floor(Math.log2(numTables)) * 16);
    const entrySelector = Math.floor(Math.log2(numTables));
    const rangeShift = numTables * 16 - searchRange;
    writer.writeUint16(searchRange);
    writer.writeUint16(entrySelector);
    writer.writeUint16(rangeShift);

    const tableRecordsStart = 12;
    let offset = tableRecordsStart + numTables * 16;
    for (let index = 0; index < numTables; index++) {
      writer.reset(offset);
      const table = this.#tables[index];
      table.writeTable(writer);
      const length = writer.position - offset;
      // write table record
      writer.reset(tableRecordsStart + index * 16);
      writer.writeTag(table.tableTag);
      writer.writeUint32(this.#calculateChecksum(writer.data, offset, length));
      writer.writeUint32(offset);
      writer.writeUint32(length);
      offset += length;
    }
    return writer.getData();
  }

  #calculateChecksum(data: DataView, start: number, length: number): number {
    const max = Math.floor(length / 4) * 4;
    let sum = 0;
    for (let i = 0; i < max; i += 4) {
      sum += data.getUint32(i);
    }
    // padding
    if (length > max) {
      const bytes = [0, 0, 0, 0];
      for (let i = max; i < length; i++) {
        bytes[i - max] = data.getUint8(i);
      }
      sum += (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    }
    return sum & 0xffffffff;
  }
}
