import { DataReader, subDataView } from './data-reader.ts';
import { FontTables } from './font-tables.ts';
import { readTableRecord, type TableRecord } from './table-records.ts';
import { type CmapSubtable, selectBestCmapSubtable } from './tables/cmap.ts';
import { NameIDs } from './tables/name.ts';
import { FsSelectionFlags } from './tables/os2.ts';

export type FontType = 'TrueType' | 'CFF' | 'Type-1';

export class Font {
  private _glyphMapping: ReadonlyMap<number, number> | undefined;

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

  /**
   * The typographic ascender value.
   *
   * Uses OS/2 sTypoAscender if USE_TYPO_METRICS is set, otherwise
   * usWinAscent, falls back to hhea ascender.
   */
  readonly ascent: number;

  /**
   * The typographic descender value (typically negative).
   *
   * Uses OS/2 sTypoDescender if USE_TYPO_METRICS is set, otherwise
   * usWinDescent, falls back to hhea descender.
   */
  readonly descent: number;

  /**
   * The typographic line gap value.
   *
   * Uses OS/2 sTypoLineGap if USE_TYPO_METRICS is set, otherwise zero.
   */
  readonly lineGap: number;

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

    const os2 = this.tables['OS/2'];
    const hhea = this.tables.hhea;
    const useTypoMetrics = os2 && (os2.fsSelection & FsSelectionFlags.USE_TYPO_METRICS) !== 0;

    // Determine ascent and descent values
    if (useTypoMetrics && os2.sTypoAscender != null && os2.sTypoDescender != null) {
      // Use sTypoAscender and sTypoDescender if USE_TYPO_METRICS is set
      this.ascent = os2.sTypoAscender;
      this.descent = os2.sTypoDescender;
    } else if (os2?.usWinAscent != null && os2?.usWinDescent != null) {
      this.ascent = os2.usWinAscent;
      this.descent = -os2.usWinDescent;
    } else if (hhea) {
      this.ascent = hhea.ascender;
      this.descent = hhea.descender;
    } else {
      this.ascent = 0;
      this.descent = 0;
    }

    // Determine line gap value
    if (useTypoMetrics && os2.sTypoLineGap != null) {
      // sTypoLineGap should only be used if USE_TYPO_METRICS is set
      this.lineGap = os2.sTypoLineGap;
    } else {
      // hhea.lineGap is not usually used as a typographic fallback
      this.lineGap = 0;
    }
  }

  /**
   * The full font name as stored in the name table.
   * Returns `undefined` if the name table or the full font name entry is missing.
   */
  get fontName(): string | undefined {
    return this.tables.name?.findName(NameIDs.fullFontName)?.name;
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
   * The mapping from Unicode code points to glyph IDs.
   */
  get glyphMapping(): ReadonlyMap<number, number> {
    if (!this._glyphMapping) {
      this._glyphMapping = this.getCmapSubtable().readGlyphMapping();
    }
    return this._glyphMapping;
  }

  private getCmapSubtable(): CmapSubtable {
    const cmap = this.tables.cmap;
    if (!cmap) {
      throw new Error('Cmap table not found');
    }
    const subtable = selectBestCmapSubtable(cmap);
    if (!subtable) {
      throw new Error('No suitable cmap subtable found');
    }
    return subtable;
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
