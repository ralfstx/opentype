import { DataReader, subDataView } from './data-reader.ts';
import { FontTables } from './font-tables.ts';
import { readTableRecord, type TableRecord } from './table-records.ts';
import { type CmapSubtable, selectBestCmapSubtable } from './tables/cmap.ts';

export type FontType = 'TrueType' | 'CFF' | 'Type-1';

export class Font {
  #glyphMapping: ReadonlyMap<number, number> | undefined;

  /**
   * The type of font based on the SFNT version signature.
   */
  readonly type: FontType;

  /**
   * The table records in the font, sorted by their offset.
   */
  readonly tableRecords: ReadonlyArray<TableRecord>;

  /**
   * The font tables contained in the font.
   */
  readonly tables: FontTables;

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
    this.tableRecords = Object.values(tableRecords).toSorted((a, b) => a.offset - b.offset);
    this.tables = new FontTables(data, tableRecords);
  }

  /**
   * The mapping from Unicode code points to glyph IDs.
   */
  get glyphMapping(): ReadonlyMap<number, number> {
    if (!this.#glyphMapping) {
      this.#glyphMapping = this.getCmapSubtable().readGlyphMapping();
    }
    return this.#glyphMapping;
  }

  private getCmapSubtable(): CmapSubtable {
    const cmap = this.tables.cmap;
    if (!cmap) {
      throw new Error('Cmap table not found');
    }
    const subTable = selectBestCmapSubtable(cmap);
    if (!subTable) {
      throw new Error('No suitable cmap subtable found');
    }
    return subTable;
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
