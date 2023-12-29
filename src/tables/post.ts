import { DataReader } from 'src/data-reader.ts';

export type PostTable = {
  version: number;
  italicAngle: number;
  underlinePosition: number;
  underlineThickness: number;
  isFixedPitch: number;
  minMemType42: number;
  maxMemType42: number;
  minMemType1: number;
  maxMemType1: number;
};

export function readPostTable(data: DataView): PostTable {
  const reader = new DataReader(data);

  return {
    version: reader.readFixed(),
    italicAngle: reader.readFixed(),
    underlinePosition: reader.readInt16(),
    underlineThickness: reader.readInt16(),
    isFixedPitch: reader.readUint32(),
    minMemType42: reader.readUint32(),
    maxMemType42: reader.readUint32(),
    minMemType1: reader.readUint32(),
    maxMemType1: reader.readUint32(),
  };
}
