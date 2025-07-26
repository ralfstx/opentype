import { DataReader } from '../../data-reader.ts';

export abstract class CoverageTable {
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

  abstract lookupGlyphId(codePoint: number): number;
}

class CoverageTable1 extends CoverageTable {
  #glyphIds: number[];

  constructor(glyphIds: number[]) {
    super();
    this.#glyphIds = glyphIds;
  }

  lookupGlyphId(codePoint: number): number {
    let low = 0;
    let high = this.#glyphIds.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midVal = this.#glyphIds[mid];
      if (midVal === codePoint) return mid;
      if (midVal < codePoint) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return -1;
  }
}

class CoverageTable2 extends CoverageTable {
  #glyphRanges: { start: number; end: number; startCoverageIndex: number }[];

  constructor(glyphRanges: { start: number; end: number; startCoverageIndex: number }[]) {
    super();
    this.#glyphRanges = glyphRanges;
  }

  lookupGlyphId(codePoint: number): number {
    let low = 0;
    let high = this.#glyphRanges.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const range = this.#glyphRanges[mid];

      if (codePoint < range.start) {
        high = mid - 1;
      } else if (codePoint > range.end) {
        low = mid + 1;
      } else {
        return range.startCoverageIndex + (codePoint - range.start);
      }
    }

    return -1;
  }
}
