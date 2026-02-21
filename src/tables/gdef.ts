import { DataReader, subDataView } from '../data-reader.ts';
import { ClassDefTable } from './common/classdef.ts';
import { CoverageTable } from './common/coverage.ts';

/**
 * Glyph class values as defined by the GDEF table.
 */
export const GlyphClass = {
  Base: 1,
  Ligature: 2,
  Mark: 3,
  Component: 4,
} as const;

export type GlyphClass = (typeof GlyphClass)[keyof typeof GlyphClass];

/**
 * The 'GDEF' table contains glyph classification and other information
 * used by OpenType layout processing (GSUB/GPOS).
 *
 * See https://learn.microsoft.com/en-us/typography/opentype/spec/gdef
 */
export class GdefTable {
  /**
   * Classifies glyphs as Base (1), Ligature (2), Mark (3), or Component (4).
   * Glyphs not listed default to class 0 (undefined class).
   */
  readonly glyphClassDef: ClassDefTable | undefined;

  /**
   * Maps mark glyphs to attachment classes. Used by the
   * MARK_ATTACHMENT_CLASS_FILTER in lookup flags.
   */
  readonly markAttachClassDef: ClassDefTable | undefined;

  /**
   * Array of mark glyph sets, each defined by a CoverageTable.
   * Referenced by the USE_MARK_FILTERING_SET lookup flag.
   */
  readonly markGlyphSets: ReadonlyArray<CoverageTable> | undefined;

  /**
   * Reads a 'GDEF' table from the given DataView.
   */
  static read(data: DataView): GdefTable {
    return new GdefTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const majorVersion = reader.readUint16();
    if (majorVersion !== 1) {
      throw new Error(`Unsupported GDEF table version ${majorVersion}`);
    }
    const minorVersion = reader.readUint16();

    const glyphClassDefOffset = reader.readUint16();
    reader.readUint16(); // attachListOffset (not used for shaping)
    reader.readUint16(); // ligCaretListOffset (not relevant for PDF)
    const markAttachClassDefOffset = reader.readUint16();

    // Version 1.2+ adds mark glyph sets
    const markGlyphSetsDefOffset = minorVersion >= 2 ? reader.readUint16() : 0;

    // Version 1.3+ adds item variation store (for variable fonts)
    // Not supported yet, just skip
    if (minorVersion >= 3) reader.readUint32(); // itemVarStoreOffset

    if (glyphClassDefOffset) {
      this.glyphClassDef = ClassDefTable.read(subDataView(data, glyphClassDefOffset));
    }
    if (markAttachClassDefOffset) {
      this.markAttachClassDef = ClassDefTable.read(subDataView(data, markAttachClassDefOffset));
    }
    if (markGlyphSetsDefOffset) {
      this.markGlyphSets = readMarkGlyphSetsTable(subDataView(data, markGlyphSetsDefOffset));
    }
  }

  /**
   * Returns the glyph class for a given glyph ID.
   * Returns 0 if the glyph has no class assigned.
   */
  getGlyphClass(glyphId: number): number {
    return this.glyphClassDef?.lookup(glyphId) ?? 0;
  }

  /**
   * Returns the mark attachment class for a given glyph ID.
   * Returns 0 if the glyph has no mark attachment class.
   */
  getMarkAttachClass(glyphId: number): number {
    return this.markAttachClassDef?.lookup(glyphId) ?? 0;
  }

  /**
   * Checks whether a glyph is in the specified mark glyph set.
   */
  isMarkInSet(glyphId: number, setIndex: number): boolean {
    const set = this.markGlyphSets?.[setIndex];
    return set ? set.lookupGlyphId(glyphId) !== -1 : false;
  }
}

function readMarkGlyphSetsTable(data: DataView): CoverageTable[] {
  const reader = new DataReader(data);

  const format = reader.readUint16();
  if (format !== 1) {
    throw new Error(`Unsupported MarkGlyphSetsTable format ${format}`);
  }

  const markGlyphSetCount = reader.readUint16();
  const coverageOffsets = Array.from({ length: markGlyphSetCount }, () => reader.readUint32());

  return coverageOffsets.map((offset) => CoverageTable.read(subDataView(data, offset)));
}
