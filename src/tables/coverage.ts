import { DataReader } from 'src/data-reader.ts';

export abstract class CoverageTable {
  static read(data: DataView) {
    const reader = new DataReader(data);
    const format = reader.readUint16();
    if (format === 1) {
      const glyphCount = reader.readUint16();
      const glyphIds = Array.from({ length: glyphCount }, () => reader.readUint16());
      return new CoverageTable1(glyphIds);
    } else if (format === 2) {
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

  abstract lookupGlyphId(codepoint: number): number | undefined;

  abstract get glyphIds(): Iterable<number>;
}

class CoverageTable1 extends CoverageTable {
  #glyphIds: number[];

  constructor(glyphIds: number[]) {
    super();
    this.#glyphIds = glyphIds;
  }

  lookupGlyphId(codepoint: number) {
    const index = this.#glyphIds.indexOf(codepoint);
    return index === -1 ? undefined : index;
  }

  get glyphIds(): Iterable<number> {
    return this.#glyphIds;
  }
}

class CoverageTable2 extends CoverageTable {
  glyphRanges: { start: number; end: number; startCoverageIndex: number }[];

  constructor(glyphRanges: { start: number; end: number; startCoverageIndex: number }[]) {
    super();
    this.glyphRanges = glyphRanges;
  }

  lookupGlyphId(codepoint: number) {
    const range = this.glyphRanges.find(
      (range) => range.start <= codepoint && codepoint <= range.end,
    );
    if (!range) return undefined;
    return range.startCoverageIndex + (codepoint - range.start);
  }

  get glyphIds(): Iterable<number> {
    return {
      [Symbol.iterator]: () => {
        let index = 0;
        return {
          next: () => {
            if (index >= this.glyphRanges.length) {
              return { done: true, value: undefined };
            }
            const range = this.glyphRanges[index];
            const value = range.start + index - range.startCoverageIndex;
            index++;
            return { done: false, value };
          },
        };
      },
    };
  }
}
