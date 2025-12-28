import { DataReader } from './data-reader.ts';

export type TableRecord = {
  tableTag: string;
  checksum: number;
  offset: number;
  length: number;
};

export function readTableRecord(data: DataView): TableRecord {
  const reader = new DataReader(data);
  const tableTag = reader.readAscii(4);
  const checksum = reader.readUint32();
  const offset = reader.readUint32();
  const length = reader.readUint32();
  return { tableTag, checksum, offset, length };
}
