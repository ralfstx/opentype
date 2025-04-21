import { DataReader } from 'src/data-reader.ts';
import { type DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

/**
 * This table contains a list of values used by instructions.
 */
export class CvtTable {
  values: number[];

  static read(data: DataView): CvtTable {
    return new CvtTable(data);
  }

  private constructor(data: DataView) {
    // The size of the cvt table must be an even number of bytes.
    if (data.byteLength % 2 !== 0) {
      throw new Error('The cvt table is not properly aligned.');
    }
    const reader = new DataReader(data);
    const read = () => reader.readInt16();
    // The number of values is determined by the length of the table.
    this.values = Array.from({ length: data.byteLength >> 1 }, read);
  }
}

export class CvtTableBuilder extends TableBuilder {
  values: number[];

  constructor(values?: number[]) {
    super('cvt');
    this.values = values ?? [];
  }

  writeTable(writer: DataWriter): void {
    for (let i = 0, len = this.values.length; i < len; i++) {
      writer.writeUint16(this.values[i]);
    }
  }
}
