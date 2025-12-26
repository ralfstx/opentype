import { DataReader } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { TableBuilder } from '../table-builder.ts';
import { type HheaTable } from '../tables/hhea.ts';
import { type MaxpTable } from '../tables/maxp.ts';

/**
 * Represents the horizontal metrics for a single glyph.
 */
export type HorMetric = {
  advanceWidth: number;
  leftSideBearing: number;
};

/**
 * The 'hmtx' (Horizontal Metrics) table contains the horizontal metrics for each glyph in the font.
 */
export class HmtxTable {
  readonly hMetrics: HorMetric[];
  readonly leftSideBearings?: number[];

  /**
   * Reads a 'hmtx' table from the given DataView.
   */
  static read(data: DataView, hhea: HheaTable, maxp: MaxpTable): HmtxTable {
    return new HmtxTable(data, hhea, maxp);
  }

  private constructor(data: DataView, hhea: HheaTable, maxp: MaxpTable) {
    const reader = new DataReader(data);

    // The number of records is determined by the `numberOfHMetrics`
    // field in the `hhea` table.
    this.hMetrics = new Array<HorMetric>(hhea.numberOfHMetrics);
    for (let i = 0; i < hhea.numberOfHMetrics; i++) {
      const advanceWidth = reader.readUint16();
      const leftSideBearing = reader.readInt16();
      this.hMetrics[i] = { advanceWidth, leftSideBearing };
    }

    // The number of elements in the `leftSideBearings` array is derived
    // from the `numGlyphs` field in the `maxp` table minus
    // `numberOfHMetrics`.
    const len = maxp.numGlyphs - hhea.numberOfHMetrics;
    if (len > 0) {
      this.leftSideBearings = new Array(len);
      for (let i = 0; i < len; i++) {
        this.leftSideBearings[i] = reader.readInt16();
      }
    }
  }
}

/**
 * Builder for the 'hmtx' table.
 */
export class HmtxTableBuilder extends TableBuilder {
  hMetrics: { advanceWidth: number; leftSideBearing: number }[];
  leftSideBearings: number[];

  /**
   * Creates a HmtxTableBuilder for the given HmtxTable.
   */
  static forTable(hmtx: HmtxTable): HmtxTableBuilder {
    return new HmtxTableBuilder(hmtx);
  }

  constructor(data?: {
    hMetrics: { advanceWidth: number; leftSideBearing: number }[];
    leftSideBearings?: number[];
  }) {
    super('hmtx');
    this.hMetrics = data?.hMetrics.slice() ?? [];
    this.leftSideBearings = data?.leftSideBearings?.slice() ?? [];
  }

  writeTable(writer: DataWriter): void {
    for (let i = 0, len = this.hMetrics.length; i < len; i++) {
      writer.writeUint16(this.hMetrics[i].advanceWidth);
      writer.writeInt16(this.hMetrics[i].leftSideBearing);
    }
    for (let i = 0, len = this.leftSideBearings.length; i < len; i++) {
      writer.writeInt16(this.leftSideBearings[i]);
    }
  }
}
