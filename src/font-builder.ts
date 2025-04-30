import { DataWriter } from 'src/data-writer.ts';
import { type TableBuilder } from 'src/table-builder.ts';

import { subDataView } from './data-reader.ts';

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
    let headOffset = -1;

    writer.writeUint32(this.sfntVersion);
    writer.writeUint16(numTables);

    const entrySelector = Math.floor(Math.log2(numTables));
    const searchRange = Math.pow(2, entrySelector) * 16;
    const rangeShift = numTables * 16 - searchRange;
    writer.writeUint16(searchRange);
    writer.writeUint16(entrySelector);
    writer.writeUint16(rangeShift);

    const tableRecordsStart = 12;
    let tableOffset = tableRecordsStart + numTables * 16;

    for (let index = 0; index < numTables; index++) {
      writer.seek(tableOffset);
      const table = this.#tables[index];
      if (table.tableTag === 'head') headOffset = tableOffset;
      table.writeTable(writer);

      // pad to 4 bytes
      const padding = (4 - (writer.position % 4)) % 4;
      for (let i = 0; i < padding; i++) {
        writer.writeUint8(0);
      }

      const length = writer.position - tableOffset;
      const tableData = subDataView(writer.getData(), tableOffset, length);

      // write table record
      writer.seek(tableRecordsStart + index * 16);
      writer.writeAscii(table.tableTag.padEnd(4, ' '));
      writer.writeUint32(this.#calculateChecksum(tableData));
      writer.writeUint32(tableOffset);
      writer.writeUint32(length);
      tableOffset += length;
    }

    if (headOffset < 0) {
      throw new Error('head table not found');
    }

    // Temporarily set the checksumAdjustment to 0.
    writer.seek(headOffset + 8);
    writer.writeUint32(0);

    const data = writer.getData();

    // Calculate the checksum for the entire font data.
    const checksum = this.#calculateChecksum(data);

    // Compute the checksumAdjustment
    const checksumAdjustment = (0xb1b0afba - checksum) >>> 0;

    // Store the checksumAdjustment in the 'head' table
    writer.seek(headOffset + 8);
    writer.writeUint32(checksumAdjustment);

    return writer.getData();
  }

  #calculateChecksum(data: DataView): number {
    if (data.byteLength % 4 !== 0) {
      throw new Error('Data length must be a multiple of 4');
    }
    let sum = 0;
    for (let i = 0; i < data.byteLength; i += 4) {
      sum = (sum + data.getUint32(i)) >>> 0;
    }
    return sum;
  }
}
