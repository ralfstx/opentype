import { DataReader, subDataView } from 'src/data-reader.ts';

/**
 * The LookupList table points to Lookup tables for  for glyph
 * substitution and glyph positioning.
 *
 * See
 *  https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#lookuplist-table
 */
export class LookupListTable {
  readonly #data: DataView;
  /** Number of lookup tables. */
  readonly lookupCount: number;
  /** Array of offsets to Lookup tables, from beginning of LookupList. */
  private readonly lookupOffsets: number[];

  constructor(data: DataView) {
    this.#data = data;
    const reader = new DataReader(data);

    this.lookupCount = reader.readUint16();
    this.lookupOffsets = Array.from({ length: this.lookupCount }, () => reader.readUint16());
  }

  readLookupTable(index: number) {
    return new LookupTable(subDataView(this.#data, this.lookupOffsets[index]));
  }
}

export class LookupTable {
  #data: DataView;
  /** Different enumerations for GSUB and GPOS. */
  lookupType: number;
  /** Lookup qualifiers. */
  lookupFlag: number;
  /**	Number of sub tables. */
  subTableCount: number;
  /** Array of offsets to lookup subtables, from beginning of Lookup
   * table. */
  private readonly subTableOffsets: number[];
  /** Index (base 0) into GDEF mark glyph sets structure. This field is
   * only present if the USE_MARK_FILTERING_SET lookup flag is set. */
  markFilteringSet?: number;

  constructor(data: DataView) {
    this.#data = data;
    const reader = new DataReader(data);

    this.lookupType = reader.readUint16();
    this.lookupFlag = reader.readUint16();
    this.subTableCount = reader.readUint16();
    this.subTableOffsets = Array.from({ length: this.subTableCount }, () => reader.readUint16());
    if (this.lookupFlag & lookupFlags.USE_MARK_FILTERING_SET) {
      this.markFilteringSet = reader.readUint16();
    }
  }

  getSubTableData(index: number) {
    return subDataView(this.#data, this.subTableOffsets[index]);
  }
}

export const lookupFlags = {
  /**
   * This bit is used only in relation to cursive attachment positioning
   * (GPOS lookup type 3). When this bit is set, the last glyph in a
   * matched input sequence will be positioned on the baseline.
   */
  RIGHT_TO_LEFT: 0x0001,
  /** If set, skips over base glyphs */
  IGNORE_BASE_GLYPHS: 0x0002,
  /** If set, skips over ligatures */
  IGNORE_LIGATURES: 0x0004,
  /** If set, skips over all combining marks */
  IGNORE_MARKS: 0x0008,
  /**
   * If set, indicates that the Lookup table structure includes the
   * markFilteringSet field. The layout engine skips over all mark glyphs
   * not in the mark filtering set indicated.
   */
  USE_MARK_FILTERING_SET: 0x0010,
  /**
   * If not zero, skips over all marks not in the specified mark attachment class.
   */
  MARK_ATTACHMENT_CLASS_FILTER: 0xff00,
} as const;
