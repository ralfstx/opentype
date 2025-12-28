import { DataReader, subDataView } from './data-reader.ts';
import { FontTables } from './font-tables.ts';
import { readTableRecord, type TableRecord } from './table-records.ts';
import { type CmapSubtable, selectBestCmapSubtable } from './tables/cmap.ts';
import { nameIDs } from './tables/name.ts';

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
   * The full font name as stored in the name table.
   * Returns `undefined` if the name table or the full font name entry is missing.
   */
  get fontName(): string | undefined {
    return this.tables.name?.findName(nameIDs.fullFontName)?.name;
  }

  /**
   * The number of glyphs in the font.
   */
  get numGlyphs(): number {
    return this.tables.maxp?.numGlyphs ?? 0;
  }

  /**
   * The number of font units per em square.
   */
  get unitsPerEm(): number {
    return this.tables.head?.unitsPerEm ?? 1000;
  }

  /**
   * The typographic ascender value.
   * Prefers OS/2 sTypoAscender, falls back to hhea ascender.
   */
  get ascent(): number {
    return this.tables['OS/2']?.sTypoAscender ?? this.tables.hhea?.ascender ?? 0;
  }

  /**
   * The typographic descender value (typically negative).
   * Prefers OS/2 sTypoDescender, falls back to hhea descender.
   */
  get descent(): number {
    return this.tables['OS/2']?.sTypoDescender ?? this.tables.hhea?.descender ?? 0;
  }

  /**
   * The typographic line gap value.
   * Prefers OS/2 sTypoLineGap, falls back to hhea lineGap.
   */
  get lineGap(): number {
    return this.tables['OS/2']?.sTypoLineGap ?? this.tables.hhea?.lineGap ?? 0;
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
