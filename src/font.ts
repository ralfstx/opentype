import { DataReader, subDataView } from './data-reader.ts';
import { FontTables } from './font-tables.ts';
import { readTableRecord, type TableRecord } from './table-records.ts';
import { type CmapSubtable, selectBestCmapSubtable } from './tables/cmap.ts';
import { MacStyle } from './tables/head.ts';
import { NameIDs } from './tables/name.ts';
import { FsSelection } from './tables/os2.ts';

export type FontType = 'TrueType' | 'CFF' | 'Type-1';

/**
 * The style of a font.
 */
export type FontStyle = 'normal' | 'italic' | 'oblique';

/**
 * A bounding box in font units.
 */
export type BoundingBox = {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
};

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
    const data = new DataView(fontData.buffer, fontData.byteOffset, fontData.byteLength);
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
    const useTypoMetrics = os2 && (os2.fsSelection & FsSelection.USE_TYPO_METRICS) !== 0;

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
   * The height of flat capital letters such as "H", in font units. Taken
   * from the OS/2 table, or for fonts with TrueType outlines measured from
   * the outline of the "H" glyph. Undefined if neither is available.
   */
  get capHeight(): number | undefined {
    return positiveOrUndefined(this.tables['OS/2']?.sCapHeight) ?? this.measureGlyphHeight('H');
  }

  /**
   * The height of flat lowercase letters such as "x", in font units. Taken
   * from the OS/2 table, or for fonts with TrueType outlines measured from
   * the outline of the "x" glyph. Undefined if neither is available.
   */
  get xHeight(): number | undefined {
    return positiveOrUndefined(this.tables['OS/2']?.sxHeight) ?? this.measureGlyphHeight('x');
  }

  /**
   * The angle of upright strokes in degrees, counter-clockwise from the
   * vertical. Negative for fonts that lean to the right, zero for upright
   * fonts.
   */
  get italicAngle(): number {
    return this.tables.post?.italicAngle ?? 0;
  }

  /**
   * The bounding box of all glyphs in the font, in font units.
   */
  get bbox(): BoundingBox {
    const head = this.tables.head;
    return { xMin: head?.xMin ?? 0, yMin: head?.yMin ?? 0, xMax: head?.xMax ?? 0, yMax: head?.yMax ?? 0 };
  }

  /**
   * The style of the font, as declared by the selection flags in the OS/2
   * table, or by the style flags in the head table if there is no OS/2
   * table. The oblique flag is only defined for OS/2 version 4 and later.
   */
  get style(): FontStyle {
    const os2 = this.tables['OS/2'];
    if (os2) {
      if (os2.version >= 4 && os2.fsSelection & FsSelection.OBLIQUE) return 'oblique';
      return os2.fsSelection & FsSelection.ITALIC ? 'italic' : 'normal';
    }
    return (this.tables.head?.macStyle ?? 0) & MacStyle.italic ? 'italic' : 'normal';
  }

  /**
   * The weight of the font, from 1 to 1000, e.g. 400 for regular and 700
   * for bold. Taken from `usWeightClass` in the OS/2 table, undefined if
   * this value is missing or out of range.
   */
  get weight(): number | undefined {
    const weightClass = this.tables['OS/2']?.usWeightClass;
    return weightClass !== undefined && weightClass >= 1 && weightClass <= 1000 ? weightClass : undefined;
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

  /**
   * Returns the top of the TrueType outline of the glyph for the given
   * character, or undefined if the font has no such outline.
   */
  private measureGlyphHeight(char: string): number | undefined {
    const glyf = this.tables.glyf;
    if (!glyf) return undefined;
    const glyphId = this.glyphMapping.get(char.codePointAt(0)!);
    if (!glyphId) return undefined;
    const { data } = glyf.readGlyph(glyphId);
    // The glyph header contains numberOfContours, xMin, yMin, xMax, yMax.
    // Empty glyphs have no header.
    return data.byteLength >= 10 ? data.getInt16(8) : undefined;
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

function positiveOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}
