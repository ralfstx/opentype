import { DataReader, subDataView } from 'src/data-reader.ts';
import { readTableRecord, type TableRecord } from 'src/table-records.ts';

import { FontTables } from './font-tables.ts';
import { type CmapSubtable } from './tables/cmap.ts';

export class Font {
  readonly tableRecords: TableRecord[];
  readonly tables: FontTables;
  #cmapSubtable: CmapSubtable | undefined;

  static fromData(fontData: Uint8Array): Font {
    const data = new DataView(fontData.buffer);
    const reader = new DataReader(data);
    const sfntVersion = reader.readUint32();
    // Known values are:
    // 0x00010000 - OpenType font with TrueType data
    // 0x4f54544f ('OTTO') - OpenType font with CFF data
    // 0x74727565 ('true') - True Type font (deprecated, not used anymore)
    // 0x74797031 ('typ1') - PostScript Type 1 font (deprecated, not used anymore)
    if (
      sfntVersion !== 0x00010000 &&
      sfntVersion !== 0x4f54544f &&
      sfntVersion !== 0x74727565 &&
      sfntVersion !== 0x74797031
    ) {
      throw new Error('Unsupported font signature: 0x' + sfntVersion.toString(16).padStart(8, '0'));
    }
    const numTables = reader.readUint16();
    // searchRange, entrySelector, rangeShift are only used for optimization
    reader.readUint16();
    reader.readUint16();
    reader.readUint16();
    const tableRecords: Record<string, TableRecord> = {};
    let offset = 12;
    for (let i = 0; i < numTables; i++) {
      const record = readTableRecord(subDataView(data, offset));
      tableRecords[record.tableTag] = record;
      offset += 16;
    }

    return new Font(data, tableRecords);
  }

  constructor(data: DataView, tableRecords: Record<string, TableRecord>) {
    this.tableRecords = Object.values(tableRecords);
    this.tables = new FontTables(data, tableRecords);
  }

  lookupGlyphId(codePoint: number): number | undefined {
    return this.getCmapSubtable()?.lookupGlyphId(codePoint);
  }

  private getCmapSubtable(): CmapSubtable | undefined {
    if (this.#cmapSubtable) {
      return this.#cmapSubtable;
    }
    const cmap = this.tables.cmap;
    if (!cmap) {
      throw new Error('Cmap table not found');
    }
    this.#cmapSubtable = cmap.selectBestSubtable();
    if (!this.#cmapSubtable) {
      throw new Error('No suitable cmap subtable found');
    }
    return this.#cmapSubtable;
  }
}
