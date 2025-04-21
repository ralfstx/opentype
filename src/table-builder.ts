import { type DataWriter } from 'src/data-writer.ts';

export abstract class TableBuilder {
  readonly tableTag: string;

  constructor(tableTag: string) {
    this.tableTag = tableTag;
  }

  abstract writeTable(writer: DataWriter): void;
}
