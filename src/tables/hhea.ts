import { DataReader } from 'src/data-reader.ts';

export type HheaTable = {
  majorVersion: number;
  minorVersion: number;
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
  metricDataFormat: number;
  numberOfHMetrics: number;
};

export function readHheaTable(data: DataView): HheaTable {
  const reader = new DataReader(data);

  const majorVersion = reader.readUint16();
  const minorVersion = reader.readUint16();
  const ascender = reader.readInt16();
  const descender = reader.readInt16();
  const lineGap = reader.readInt16();
  const advanceWidthMax = reader.readUint16();
  const minLeftSideBearing = reader.readInt16();
  const minRightSideBearing = reader.readInt16();
  const xMaxExtent = reader.readInt16();
  const caretSlopeRise = reader.readInt16();
  const caretSlopeRun = reader.readInt16();
  const caretOffset = reader.readInt16();
  reader.readInt16(); // reserved
  reader.readInt16(); // reserved
  reader.readInt16(); // reserved
  reader.readInt16(); // reserved
  const metricDataFormat = reader.readInt16();
  const numberOfHMetrics = reader.readUint16();

  return {
    majorVersion,
    minorVersion,
    ascender,
    descender,
    lineGap,
    advanceWidthMax,
    minLeftSideBearing,
    minRightSideBearing,
    xMaxExtent,
    caretSlopeRise,
    caretSlopeRun,
    caretOffset,
    metricDataFormat,
    numberOfHMetrics,
  };
}
