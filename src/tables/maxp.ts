import { DataReader } from 'src/data-reader.ts';

export type MaxpTable = {
  numGlyphs: number;
};

export function readMaxpTable(data: DataView): MaxpTable {
  const reader = new DataReader(data);
  const version = reader.readUint32();
  // 0x00005000 for version 0.5, 0x00010000 for version 1.0
  if (version !== 0x00005000 && version !== 0x00010000) {
    throw new Error('Invalid maxp table version');
  }
  const numGlyphs = reader.readUint16();
  return { numGlyphs };
}
