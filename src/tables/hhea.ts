import assert from 'node:assert';

import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

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

  static read(data: DataView): HheaTable {
    return new HheaTable(data);
  }

  private constructor(data: DataView) {
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

export class HheaTableBuilder extends TableBuilder {
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
  numberOfHMetrics: number;

  constructor(init?: HheaTable) {
    super('hhea');
    this.ascender = init?.ascender ?? 0;
    this.descender = init?.descender ?? 0;
    this.lineGap = init?.lineGap ?? 0;
    this.advanceWidthMax = init?.advanceWidthMax ?? 0;
    this.minLeftSideBearing = init?.minLeftSideBearing ?? 0;
    this.minRightSideBearing = init?.minRightSideBearing ?? 0;
    this.xMaxExtent = init?.xMaxExtent ?? 0;
    this.caretSlopeRise = init?.caretSlopeRise ?? 0;
    this.caretSlopeRun = init?.caretSlopeRun ?? 0;
    this.caretOffset = init?.caretOffset ?? 0;
    this.numberOfHMetrics = init?.numberOfHMetrics ?? 0;
  }

  writeTable(writer: DataWriter): void {
    writer.writeUint16(1); // majorVersion
    writer.writeUint16(0); // minorVersion
    writer.writeInt16(this.ascender);
    writer.writeInt16(this.descender);
    writer.writeInt16(this.lineGap);
    writer.writeUint16(this.advanceWidthMax);
    writer.writeInt16(this.minLeftSideBearing);
    writer.writeInt16(this.minRightSideBearing);
    writer.writeInt16(this.xMaxExtent);
    writer.writeInt16(this.caretSlopeRise);
    writer.writeInt16(this.caretSlopeRun);
    writer.writeInt16(this.caretOffset);
    writer.writeInt16(0); // reserved
    writer.writeInt16(0); // reserved
    writer.writeInt16(0); // reserved
    writer.writeInt16(0); // reserved
    writer.writeInt16(0); // metricDataFormat
    writer.writeUint16(this.numberOfHMetrics);
  }
}
