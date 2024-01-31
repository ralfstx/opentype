import { DataReader, subDataView } from 'src/data-reader.ts';
import { readTableRecord, TableRecord } from 'src/table-records.ts';
import { readCmapTable } from 'src/tables/cmap.ts';
import { CmapTable } from 'src/tables/cmap.ts';
import { GsubTable } from 'src/tables/gsub.ts';
import { readHeadTable } from 'src/tables/head.ts';
import { HeadTable } from 'src/tables/head.ts';
import { readHheaTable } from 'src/tables/hhea.ts';
import { HheaTable } from 'src/tables/hhea.ts';
import { readHmtxTable } from 'src/tables/hmtx.ts';
import { HmtxTable } from 'src/tables/hmtx.ts';
import { readMaxpTable } from 'src/tables/maxp.ts';
import { MaxpTable } from 'src/tables/maxp.ts';
import { readNameTable } from 'src/tables/name.ts';
import { NameTable } from 'src/tables/name.ts';
import { readOs2Table } from 'src/tables/os2.ts';
import { OS2Table } from 'src/tables/os2.ts';
import { readPostTable } from 'src/tables/post.ts';
import { PostTable } from 'src/tables/post.ts';

export type Font = {
  tableRecords: TableRecord[];
  tables: {
    cmap: CmapTable;
    head: HeadTable;
    hhea: HheaTable;
    hmtx: HmtxTable;
    maxp: MaxpTable;
    name: NameTable;
    os2: OS2Table;
    post: PostTable;
    gsub: GsubTable;
  };
};

export function readFont(data: Uint8Array): Font {
  return readOTF(new DataView(data.buffer));
}

export function readOTF(data: DataView): Font {
  const reader = new DataReader(data);
  const sfntVersion = reader.readUint32();
  // Known values are:
  // 0x00010000 - OpenType font with TrueType data
  // 0x4f54544f ('OTTO') - OpenType font with CFF data
  // 0x74727565 ('true') - True Type font (should not be used in OpenType fonts)
  // 0x74797031 ('typ1') - PostScript Type 1 font (should not be used in OpenType fonts)
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

  const head = readTable('head', readHeadTable);
  const maxp = readTable('maxp', readMaxpTable);
  const cmap = readTable('cmap', readCmapTable);
  const hhea = readTable('hhea', readHheaTable);
  const hmtx = readTable('hmtx', (data) =>
    readHmtxTable(data, hhea.numberOfHMetrics, maxp.numGlyphs)
  );
  const name = readTable('name', readNameTable);
  const os2 = readTable('OS/2', readOs2Table);
  const post = readTable('post', readPostTable);
  const gsub = readTable('GSUB', (data) => new GsubTable(data));

  return {
    tables: { os2, head, cmap, maxp, hhea, hmtx, post, name, gsub },
    tableRecords: Object.values(tableRecords),
  };
}
