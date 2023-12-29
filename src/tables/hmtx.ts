import { DataReader } from 'src/data-reader.ts';

export type HorMetric = {
  advanceWidth: number;
  leftSideBearing: number;
};

export type HmtxTable = {
  hMetrics: HorMetric[];
  leftSideBearings?: number[];
};

export function readHmtxTable(
  data: DataView,
  numberOfHMetrics: number,
  numGlyphs: number
): HmtxTable {
  const reader = new DataReader(data);

  // The number of records is determined by the numberOfHMetrics field in the 'hhea' table.
  const hMetrics = new Array(numberOfHMetrics);
  for (let i = 0; i < numberOfHMetrics; i += 1) {
    if (i < numberOfHMetrics) {
      const advanceWidth = reader.readUint16;
      const leftSideBearing = reader.readInt16();
      hMetrics.push({ advanceWidth, leftSideBearing });
    }
  }

  const hmtx: HmtxTable = { hMetrics };

  // The number of elements in the leftSideBearings array will be
  // derived from the numGlyphs field in the 'maxp' table minus
  // numberOfHMetrics.
  const len = numGlyphs - numberOfHMetrics;
  if (len > 0) {
    hmtx.leftSideBearings = new Array(len);
    for (let i = 0; i < len; i += 1) {
      const leftSideBearing = reader.readInt16();
      hmtx.leftSideBearings.push(leftSideBearing);
    }
  }
  return hmtx;
}
