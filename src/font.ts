import { DataReader, subDataView } from './data-reader.ts';
import { FontTables } from './font-tables.ts';
import { readTableRecord, type TableRecord } from './table-records.ts';
import { type CmapSubtable } from './tables/cmap.ts';

export type FontType = 'TrueType' | 'CFF' | 'Type-1';

export class Font {
  /**
   * The type of font based on the SFNT version signature.
   */
  readonly type: FontType;
  readonly tableRecords: TableRecord[];
  readonly tables: FontTables;
  #cmapSubtable: CmapSubtable | undefined;

  static fromData(fontData: Uint8Array): Font {
    const data = new DataView(fontData.buffer);
    const reader = new DataReader(data);
    const sfntVersion = reader.readUint32();
    const type = getFontType(sfntVersion);
    if (!type) {
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

    return new Font(type, data, tableRecords);
  }

  private constructor(type: FontType, data: DataView, tableRecords: Record<string, TableRecord>) {
    this.type = type;
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

function getFontType(sfntVersion: number): FontType | undefined {
  if (sfntVersion === 0x00010000) {
    // 0x00010000 - OpenType font with TrueType data
    return 'TrueType';
  }
  if (sfntVersion === 0x4f54544f) {
    // 0x4f54544f ('OTTO') - OpenType font with CFF data
    return 'CFF';
  }
  if (sfntVersion === 0x74727565) {
    // 0x74727565 ('true') - True Type font (deprecated, not used anymore)
    return 'TrueType';
  }
  if (sfntVersion === 0x74797031) {
    // 0x74797031 ('typ1') - PostScript Type 1 font (deprecated, not used anymore)
    return 'Type-1';
  }
}
