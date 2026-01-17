import { DataReader } from '../../data-reader.ts';

/**
 * The Coverage table indicates the glyphs that are involved in
 * substitution or positioning.
 */
export abstract class CoverageTable {
  private lookupCache: Map<number, number> | undefined;

  static read(data: DataView) {
    const reader = new DataReader(data);
    const format = reader.readUint16();
    if (format === 1) {
      const glyphCount = reader.readUint16();
      const glyphIds = Array.from({ length: glyphCount }, () => reader.readUint16());
      return new CoverageTable1(glyphIds);
    }
    if (format === 2) {
      const rangeCount = reader.readUint16();
      const glyphRanges = Array.from({ length: rangeCount }, () => {
        const start = reader.readUint16();
        const end = reader.readUint16();
        const startCoverageIndex = reader.readUint16();
        return { start, end, startCoverageIndex };
      });
      return new CoverageTable2(glyphRanges);
    }
    throw new Error(`Unsupported coverage table format ${format}`);
  }

  /**
   * Looks up the glyph ID in the coverage table.
   */
  lookupGlyphId(glyphId: number): number {
    const cached = this.lookupCache?.get(glyphId);
    if (cached !== undefined) {
      return cached;
    }

    const index = this._lookupGlyphId(glyphId);
    (this.lookupCache ??= new Map()).set(glyphId, index);
    return index;
  }

  protected abstract _lookupGlyphId(glyphId: number): number;
}

class CoverageTable1 extends CoverageTable {
  private readonly glyphIds: number[];

  constructor(glyphIds: number[]) {
    super();
    this.glyphIds = glyphIds;
  }

  protected override _lookupGlyphId(glyphId: number): number {
    let low = 0;
    let high = this.glyphIds.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midVal = this.glyphIds[mid];
      if (midVal === glyphId) return mid;
      if (midVal < glyphId) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return -1;
  }
}

class CoverageTable2 extends CoverageTable {
  private readonly glyphRanges: { start: number; end: number; startCoverageIndex: number }[];

  constructor(glyphRanges: { start: number; end: number; startCoverageIndex: number }[]) {
    super();
    this.glyphRanges = glyphRanges;
  }

  protected override _lookupGlyphId(glyphId: number): number {
    let low = 0;
    let high = this.glyphRanges.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const range = this.glyphRanges[mid];

      if (glyphId < range.start) {
        high = mid - 1;
      } else if (glyphId > range.end) {
        low = mid + 1;
      } else {
        return range.startCoverageIndex + (glyphId - range.start);
      }
    }

    return -1;
  }
}
