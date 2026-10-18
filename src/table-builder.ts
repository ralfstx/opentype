import { type DataWriter } from './data-writer.ts';

/**
 * Base class for building font tables.
 */
export abstract class TableBuilder {
  /** The table tag (four-character identifier) */
  readonly tableTag: string;

  constructor(tableTag: string) {
    this.tableTag = tableTag;
  }

  /**
   * Writes the table to the given DataWriter.
   */
  abstract writeTable(writer: DataWriter): void;
}

/**
 * Builds a table by copying existing table data unchanged.
 */
export class RawTableBuilder extends TableBuilder {
  private readonly data: DataView;

  constructor(tableTag: string, data: DataView) {
    super(tableTag);
    this.data = data;
  }

  override writeTable(writer: DataWriter): void {
    writer.writeData(this.data);
  }
}
