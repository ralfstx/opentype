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
