import assert from 'node:assert';

import { DataReader } from 'src/data-reader.ts';

export class HheaTable {
  ascender: number;
  descender: number;
  lineGap: number;
  advanceWidthMax: number;
  minLeftSideBearing: number;
  minRightSideBearing: number;
  xMaxExtent: number;
  caretSlopeRise: number;
  caretSlopeRun: number;
  caretOffset: number;
  /** Number of hMetric entries in the `hmtx` table. */
  numberOfHMetrics: number;

  constructor(data: DataView) {
    const reader = new DataReader(data);

    assert.equal(reader.readUint16(), 1, 'majorVersion should be 1');
    assert.equal(reader.readUint16(), 0, 'minorVersion should be 0');
    this.ascender = reader.readInt16();
    this.descender = reader.readInt16();
    this.lineGap = reader.readInt16();
    this.advanceWidthMax = reader.readUint16();
    this.minLeftSideBearing = reader.readInt16();
    this.minRightSideBearing = reader.readInt16();
    this.xMaxExtent = reader.readInt16();
    this.caretSlopeRise = reader.readInt16();
    this.caretSlopeRun = reader.readInt16();
    this.caretOffset = reader.readInt16();
    reader.readInt16(); // reserved
    reader.readInt16(); // reserved
    reader.readInt16(); // reserved
    reader.readInt16(); // reserved
    assert.equal(reader.readInt16(), 0, 'metricDataFormat should be 0');
    this.numberOfHMetrics = reader.readUint16();
  }
}
