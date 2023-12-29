import { TableRecord } from 'src/table-records.ts';
import { CmapTable } from 'src/tables/cmap.ts';
import { GsubTable } from 'src/tables/gsub.ts';
import { HeadTable } from 'src/tables/head.ts';
import { HheaTable } from 'src/tables/hhea.ts';
import { HmtxTable } from 'src/tables/hmtx.ts';
import { MaxpTable } from 'src/tables/maxp.ts';
import { NameTable } from 'src/tables/name.ts';
import { OS2Table } from 'src/tables/os2.ts';
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
