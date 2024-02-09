import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

import { HheaTable } from './hhea.ts';
import { MaxpTable } from './maxp.ts';

export type HorMetric = {
  advanceWidth: number;
  leftSideBearing: number;
};

export class HmtxTable {
  hMetrics: HorMetric[];
  leftSideBearings?: number[];

  static read(data: DataView, hhea: HheaTable, maxp: MaxpTable): HmtxTable {
    return new HmtxTable(data, hhea, maxp);
  }

  private constructor(data: DataView, hhea: HheaTable, maxp: MaxpTable) {
    const reader = new DataReader(data);

    // The number of records is determined by the `numberOfHMetrics`
    // field in the `hhea` table.
    this.hMetrics = new Array(hhea.numberOfHMetrics);
    for (let i = 0; i < hhea.numberOfHMetrics; i += 1) {
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
      for (let i = 0; i < len; i += 1) {
        this.leftSideBearings[i] = reader.readInt16();
      }
    }
  }
}

export class HmtxTableBuilder extends TableBuilder {
  hMetrics: { advanceWidth: number; leftSideBearing: number }[];
  leftSideBearings: number[];

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
      writer.writeInt16(this.leftSideBearings![i]);
    }
  }
}
