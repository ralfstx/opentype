import { DataReader, subDataView } from 'src/data-reader.ts';
import { readTableRecord, type TableRecord } from 'src/table-records.ts';
import { CmapTable } from 'src/tables/cmap.ts';
import { CvtTable } from 'src/tables/cvt.ts';
import { FpgmTable } from 'src/tables/fpgm.ts';
import { GsubTable } from 'src/tables/gsub.ts';
import { HeadTable } from 'src/tables/head.ts';
import { HheaTable } from 'src/tables/hhea.ts';
import { HmtxTable } from 'src/tables/hmtx.ts';
import { LocaTable } from 'src/tables/loca.ts';
import { MaxpTable } from 'src/tables/maxp.ts';
import { NameTable } from 'src/tables/name.ts';
import { Os2Table } from 'src/tables/os2.ts';
import { PostTable } from 'src/tables/post.ts';
import { PrepTable } from 'src/tables/prep.ts';

export type Font = {
  tableRecords: TableRecord[];
  tables: {
    head?: HeadTable;
    hhea?: HheaTable;
    maxp?: MaxpTable;
    hmtx?: HmtxTable;
    loca?: LocaTable;
    cvt?: CvtTable;
    fpgm?: FpgmTable;
    prep?: PrepTable;
    name?: NameTable;
    cmap?: CmapTable;
    os2?: Os2Table;
    post?: PostTable;
    gsub?: GsubTable;
  };
};

export function readFont(fontData: Uint8Array): Font {
  const data = new DataView(fontData.buffer);
  const reader = new DataReader(data);
  const sfntVersion = reader.readUint32();
  // Known values are:
  // 0x00010000 - OpenType font with TrueType data
  // 0x4f54544f ('OTTO') - OpenType font with CFF data
  // 0x74727565 ('true') - True Type font (deprecated, not used anymore)
  // 0x74797031 ('typ1') - PostScript Type 1 font (deprecated, not used anymore)
  if (
    sfntVersion !== 0x00010000 &&
    sfntVersion !== 0x4f54544f &&
    sfntVersion !== 0x74727565 &&
    sfntVersion !== 0x74797031
  ) {
    throw new Error('Unsupported font signature: 0x' + sfntVersion.toString(16).padStart(8, '0'));
  }
  const numTables = reader.readUint16();
  // searchRange, entrySelector, rangeShift are only used for optimization
  reader.readUint16();
  reader.readUint16();
  reader.readUint16();
  const tableRecords: Record<string, TableRecord> = {};
  let offset = 12;
  for (let i = 0; i < numTables; i++) {
    const record = readTableRecord(subDataView(data, offset));
    tableRecords[record.tableTag] = record;
    offset += 16;
  }

  const readTable = (name: string, fn: (data: DataView) => any) => {
    const record = tableRecords[name];
    return record && fn(subDataView(data, record.offset, record.length));
  };

  const head = readTable('head', (data) => HeadTable.read(data));
  const hhea = readTable('hhea', (data) => HheaTable.read(data));
  const maxp = readTable('maxp', (data) => MaxpTable.read(data));
  const hmtx = readTable('hmtx', (data) => HmtxTable.read(data, hhea, maxp));
  const loca = readTable('loca', (data) => LocaTable.read(data, head, maxp));
  const cvt = readTable('cvt', (data) => CvtTable.read(data));
  const fpgm = readTable('fpgm', (data) => FpgmTable.read(data));
  const prep = readTable('prep', (data) => PrepTable.read(data));
  const name = readTable('name', (data) => NameTable.read(data));
  const cmap = readTable('cmap', (data) => CmapTable.read(data));
  const os2 = readTable('OS/2', (data) => Os2Table.read(data));
  const post = readTable('post', (data) => PostTable.read(data));
  const gsub = readTable('GSUB', (data) => GsubTable.read(data));

  return {
    tables: { head, hhea, maxp, hmtx, loca, cvt, fpgm, prep, name, os2, post, cmap, gsub },
    tableRecords: Object.values(tableRecords),
  };
}
