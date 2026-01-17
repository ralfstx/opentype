import { DataReader } from '../../data-reader.ts';

type ClassRangeRecord = {
  start: number;
  end: number;
  classValue: number;
};

/**
 * ClassDefTable maps glyph IDs to class values. It is used in GPOS and GSUB tables.
 */
export class ClassDefTable {
  private readonly format: number;
  private readonly classValueArray?: { startGlyphID: number; values: number[] };
  private readonly classRangeRecords?: ClassRangeRecord[];
  private lookupCache: Map<number, number | null> | undefined;

  /**
   * Reads a ClassDefTable from the given DataView.
   */
  static read(data: DataView): ClassDefTable {
    return new ClassDefTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);
    this.format = reader.readUint16();

    if (this.format === 1) {
      const startGlyphID = reader.readUint16();
      const glyphCount = reader.readUint16();
      const values = Array.from({ length: glyphCount }, () => reader.readUint16());
      this.classValueArray = { startGlyphID, values };
    } else if (this.format === 2) {
      const classRangeCount = reader.readUint16();
      this.classRangeRecords = Array.from({ length: classRangeCount }, () => {
        const start = reader.readUint16();
        const end = reader.readUint16();
        const classValue = reader.readUint16();
        return { start, end, classValue };
      });
    } else {
      throw new Error(`Unsupported ClassDefTable format: ${this.format}`);
    }
  }

  /**
   * Looks up the class value for a given glyph ID.
   */
  lookup(glyphID: number): number | undefined {
    // We use `null` to represent `undefined` in the cache to
    // distinguish between "not cached" and "cached as undefined".
    const cached = this.lookupCache?.get(glyphID);
    if (cached !== undefined) {
      return cached === null ? undefined : cached;
    }

    const classValue = this._lookup(glyphID);
    (this.lookupCache ??= new Map()).set(glyphID, classValue ?? null);
    return classValue;
  }

  private _lookup(glyphID: number): number | undefined {
    if (this.format === 1 && this.classValueArray) {
      const index = glyphID - this.classValueArray.startGlyphID;
      return this.classValueArray.values[index] ?? 0;
    }
    if (this.format === 2 && this.classRangeRecords) {
      let low = 0;
      let high = this.classRangeRecords.length - 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const record = this.classRangeRecords[mid];
        if (glyphID < record.start) {
          high = mid - 1;
        } else if (glyphID > record.end) {
          low = mid + 1;
        } else {
          return record.classValue;
        }
      }
    }
    // Any glyph not covered by a record is assumed to belong to class 0.
    return 0;
  }
}
