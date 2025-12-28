import { DataReader, subDataView } from '../../data-reader.ts';

/**
 * Lookup flags used in Lookup tables.
 */
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

/**
 * A Lookup table defines a single glyph substitution or positioning
 * operation.
 */
export type LookupTable = {
  /** Different enumerations for GSUB and GPOS. */
  readonly lookupType: number;

  /** Lookup qualifiers. */
  readonly lookupFlag: number;

  /**	Number of sub tables. */
  readonly subTableCount: number;

  /**
   * Index (base 0) into GDEF mark glyph sets structure. This field is
   * only present if the USE_MARK_FILTERING_SET lookup flag is set.
   */
  readonly markFilteringSet?: number;

  /**
   * Returns the DataView for the subtable at the given index.
   */
  getSubTableData: (index: number) => DataView;
};

/**
 * The LookupList table points to Lookup tables for glyph substitution
 * and glyph positioning.
 *
 * See
 * https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#lookuplist-table
 */
export class LookupListTable {
  private readonly data: DataView;
  /** Array of offsets to Lookup tables, from beginning of LookupList. */
  private readonly lookupOffsets: number[];

  /** Number of lookup tables. */
  readonly lookupCount: number;

  /**
   * Reads a LookupListTable from the given DataView.
   */
  static read(data: DataView): LookupListTable {
    return new LookupListTable(data);
  }

  private constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    this.lookupCount = reader.readUint16();
    this.lookupOffsets = Array.from({ length: this.lookupCount }, () => reader.readUint16());
  }

  readLookupTable(index: number): LookupTable {
    if (index < 0 || index >= this.lookupCount) {
      throw new Error(`Lookup index out of bounds: ${index}`);
    }
    return readLookupTable(subDataView(this.data, this.lookupOffsets[index]));
  }
}

function readLookupTable(data: DataView): LookupTable {
  const reader = new DataReader(data);

  const lookupType = reader.readUint16();
  const lookupFlag = reader.readUint16();
  const subTableCount = reader.readUint16();
  const subTableOffsets = Array.from({ length: subTableCount }, () => reader.readUint16());
  const markFilteringSet =
    lookupFlag & lookupFlags.USE_MARK_FILTERING_SET ? reader.readUint16() : undefined;

  const getSubTableData = (index: number) => {
    if (index < 0 || index >= subTableCount) {
      throw new Error(`Subtable index out of bounds: ${index}`);
    }
    return subDataView(data, subTableOffsets[index]);
  };

  return { lookupType, lookupFlag, subTableCount, markFilteringSet, getSubTableData };
}
