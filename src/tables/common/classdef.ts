import { DataReader } from '../../data-reader.ts';

/**
 * ClassDefTable maps glyph IDs to class values. It is used in GPOS and GSUB tables.
 */
export class ClassDefTable {
  private readonly format: number;
  private readonly classValueArray?: { startGlyphID: number; values: number[] };
  private readonly classRangeRecords?: ClassRangeRecord[];

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

  lookup(glyphID: number): number | undefined {
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

type ClassRangeRecord = {
  start: number;
  end: number;
  classValue: number;
};
