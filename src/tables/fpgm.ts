import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

export class FpgmTable {
  instructions: number[];

  static read(data: DataView): FpgmTable {
    return new FpgmTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);
    const read = () => reader.readInt8();
    // The number of instructions is determined by the length of the table.
    this.instructions = Array.from({ length: data.byteLength }, read);
  }
}

export class FpgmTableBuilder extends TableBuilder {
  instructions: number[];

  constructor(instructions?: number[]) {
    super('fpgm');
    this.instructions = instructions ?? [];
  }

  writeTable(writer: DataWriter): void {
    for (let i = 0, len = this.instructions.length; i < len; i++) {
      writer.writeUint8(this.instructions[i]);
    }
  }
}
