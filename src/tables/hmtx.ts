import { DataReader } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { TableBuilder } from '../table-builder.ts';
import { type HheaTable } from '../tables/hhea.ts';
import { type MaxpTable } from '../tables/maxp.ts';

/**
 * Represents the horizontal metrics for a single glyph.
 */
export type HorMetric = {
  /** The advance width for the glyph. */
  readonly advanceWidth: number;
  /** The left side bearing for the glyph. */
  readonly leftSideBearing: number;
};

/**
 * The 'hmtx' (Horizontal Metrics) table contains the horizontal metrics for each glyph in the font.
 */
export class HmtxTable {
  readonly hMetrics: ReadonlyArray<HorMetric>;
  readonly leftSideBearings?: ReadonlyArray<number>;

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
    const hMetrics = new Array<HorMetric>(hhea.numberOfHMetrics);
    for (let i = 0; i < hhea.numberOfHMetrics; i++) {
      const advanceWidth = reader.readUint16();
      const leftSideBearing = reader.readInt16();
      hMetrics[i] = { advanceWidth, leftSideBearing };
    }
    this.hMetrics = hMetrics;

    // The number of elements in the `leftSideBearings` array is derived
    // from the `numGlyphs` field in the `maxp` table minus
    // `numberOfHMetrics`.
    const len = maxp.numGlyphs - hhea.numberOfHMetrics;
    if (len > 0) {
      const leftSideBearings = new Array(len);
      for (let i = 0; i < len; i++) {
        leftSideBearings[i] = reader.readInt16();
      }
      this.leftSideBearings = leftSideBearings;
    }
  }

  /**
   * Returns the horizontal metrics of the glyph with the given ID, or
   * undefined if the glyph does not exist. Glyphs beyond the entries in
   * `hMetrics` share the advance width of the last entry, which is common
   * in monospaced fonts, and take their left side bearing from
   * `leftSideBearings`.
   */
  getMetric(glyphId: number): HorMetric | undefined {
    if (glyphId < this.hMetrics.length) {
      return this.hMetrics[glyphId];
    }
    const lastMetric = this.hMetrics.at(-1);
    const leftSideBearing = this.leftSideBearings?.[glyphId - this.hMetrics.length];
    if (!lastMetric || leftSideBearing === undefined) return undefined;
    return { advanceWidth: lastMetric.advanceWidth, leftSideBearing };
  }
}

/**
 * Builder for the 'hmtx' table.
 */
export class HmtxTableBuilder extends TableBuilder {
  hMetrics: HorMetric[];
  leftSideBearings: number[];

  /**
   * Creates a HmtxTableBuilder for the given HmtxTable.
   */
  static forTable(hmtx: HmtxTable): HmtxTableBuilder {
    return new HmtxTableBuilder(hmtx);
  }

  constructor(hmtx?: Pick<HmtxTable, 'hMetrics' | 'leftSideBearings'>) {
    super('hmtx');
    this.hMetrics = hmtx?.hMetrics.slice() ?? [];
    this.leftSideBearings = hmtx?.leftSideBearings?.slice() ?? [];
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
