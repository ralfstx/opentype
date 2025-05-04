import { DataReader } from 'src/data-reader.ts';

export type TableType = 'cmap' | 'head' | 'hhea' | 'hmtx' | 'maxp' | 'os2' | 'post';

export type TableRecord = {
  tableTag: string;
  checksum: number;
  offset: number;
  length: number;
};

export function readTableRecord(data: DataView) {
  const reader = new DataReader(data);
  const tableTag = reader.readAscii(4);
  const checksum = reader.readUint32();
  const offset = reader.readUint32();
  const length = reader.readUint32();
  return { tableTag, checksum, offset, length };
}
