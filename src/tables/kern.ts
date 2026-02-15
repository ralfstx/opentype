import { DataReader } from '../data-reader.ts';
import { type GlyphRun } from '../glyph-run.ts';

/**
 * The 'kern' table provides kerning pair adjustments for horizontal text.
 * This is the legacy kern table format; modern fonts typically use the
 * GPOS table for kerning instead.
 *
 * Only Microsoft-style (version 0) tables with format 0 subtables are
 * supported. Apple-style (version 1) tables are recognized but skipped.
 */
export class KernTable {
  private readonly pairs: ReadonlyMap<number, number>;

  /**
   * Reads a 'kern' table from the given DataView.
   * Returns `undefined` for unsupported table versions (e.g. Apple-style version 1).
   */
  static read(data: DataView): KernTable | undefined {
    const reader = new DataReader(data);
    const version = reader.readUint16();
    if (version !== 0) {
      // Apple-style kern table (version 1): the version field we read was the
      // high 16 bits of a uint32 version (1.0). Apple subtables use a different
      // format that we don't support.
      return undefined;
    }
    return new KernTable(reader);
  }

  private constructor(reader: DataReader) {
    const pairs = new Map<number, number>();
    const nTables = reader.readUint16();
    for (let i = 0; i < nTables; i++) {
      readSubtableV0(reader, pairs);
    }
    this.pairs = pairs;
  }

  /**
   * Returns the kerning value for a glyph pair, or 0 if no kerning is defined.
   */
  getKerning(leftGlyphId: number, rightGlyphId: number): number {
    return this.pairs.get(leftGlyphId * 0x10000 + rightGlyphId) ?? 0;
  }

  /**
   * Applies kerning adjustments to consecutive glyph pairs in a glyph run.
   * For performance reasons, glyphs are modified in place.
   */
  applyToGlyphRun(glyphRun: GlyphRun): void {
    const { glyphs } = glyphRun;
    for (let i = 0; i < glyphs.length - 1; i++) {
      const kern = this.getKerning(glyphs[i].glyphId, glyphs[i + 1].glyphId);
      if (kern !== 0) {
        glyphs[i].advanceAdjust = (glyphs[i].advanceAdjust ?? 0) + kern;
      }
    }
  }
}

function readSubtableV0(reader: DataReader, pairs: Map<number, number>): void {
  reader.readUint16(); // subtable version
  const length = reader.readUint16();
  const coverage = reader.readUint16();

  const format = coverage >> 8;
  const isHorizontal = (coverage & 0x01) !== 0;
  const isCrossStream = (coverage & 0x04) !== 0;

  // Only support format 0 (sorted pairs), horizontal, non-cross-stream
  if (format !== 0 || !isHorizontal || isCrossStream) {
    // Skip the rest of this subtable. Header is 6 bytes, already read.
    const remaining = length - 6;
    if (remaining > 0) {
      reader.seek(reader.position + remaining);
    }
    return;
  }

  const nPairs = reader.readUint16();
  reader.readUint16(); // searchRange
  reader.readUint16(); // entrySelector
  reader.readUint16(); // rangeShift

  for (let i = 0; i < nPairs; i++) {
    const left = reader.readUint16();
    const right = reader.readUint16();
    const value = reader.readInt16();
    if (value !== 0) {
      pairs.set(left * 0x10000 + right, value);
    }
  }
}
