import { DataReader } from 'src/data-reader.ts';

import { HheaTable } from './hhea.ts';
import { MaxpTable } from './maxp.ts';

export type HorMetric = {
  advanceWidth: number;
  leftSideBearing: number;
};

export class HmtxTable {
  hMetrics: HorMetric[];
  leftSideBearings?: number[];

  constructor(data: DataView, hhea: HheaTable, maxp: MaxpTable) {
    const reader = new DataReader(data);

    // The number of records is determined by the numberOfHMetrics field in the 'hhea' table.
    this.hMetrics = new Array(hhea.numberOfHMetrics);
    for (let i = 0; i < hhea.numberOfHMetrics; i += 1) {
      if (i < hhea.numberOfHMetrics) {
        const advanceWidth = reader.readUint16();
        const leftSideBearing = reader.readInt16();
        this.hMetrics.push({ advanceWidth, leftSideBearing });
      }
    }

    // The number of elements in the leftSideBearings array will be
    // derived from the numGlyphs field in the 'maxp' table minus
    // numberOfHMetrics.
    const len = maxp.numGlyphs - hhea.numberOfHMetrics;
    if (len > 0) {
      this.leftSideBearings = new Array(len);
      for (let i = 0; i < len; i += 1) {
        const leftSideBearing = reader.readInt16();
        this.leftSideBearings.push(leftSideBearing);
      }
    }
  }
}
