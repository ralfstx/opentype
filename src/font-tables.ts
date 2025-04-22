import { subDataView } from 'src/data-reader.ts';
import { type TableRecord } from 'src/table-records.ts';
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

type TableTag =
  | 'head'
  | 'hhea'
  | 'maxp'
  | 'hmtx'
  | 'loca'
  | 'cvt'
  | 'fpgm'
  | 'prep'
  | 'name'
  | 'cmap'
  | 'OS/2'
  | 'post'
  | 'GSUB';

export class FontTables {
  private readonly data: DataView;
  private readonly tableRecords: Record<string, TableRecord>;
  private readonly tables: Partial<Record<TableTag, unknown>> = {};

  constructor(data: DataView, tableRecords: Record<string, TableRecord>) {
    this.data = data;
    this.tableRecords = tableRecords;
    this.tables = {};
  }

  get head(): HeadTable | undefined {
    return this.readTable('head', (data) => HeadTable.read(data));
  }

  get hhea(): HheaTable | undefined {
    return this.readTable('hhea', (data) => HheaTable.read(data));
  }

  get maxp(): MaxpTable | undefined {
    return this.readTable('maxp', (data) => MaxpTable.read(data));
  }

  get hmtx(): HmtxTable | undefined {
    const hhea = this.hhea;
    const maxp = this.maxp;
    if (!hhea || !maxp) return undefined;
    return this.readTable('hmtx', (data) => HmtxTable.read(data, hhea, maxp));
  }

  get loca(): LocaTable | undefined {
    const head = this.head;
    const maxp = this.maxp;
    if (!head || !maxp) return undefined;
    return this.readTable('loca', (data) => LocaTable.read(data, head, maxp));
  }

  get cvt(): CvtTable | undefined {
    return this.readTable('cvt', (data) => CvtTable.read(data));
  }

  get fpgm(): FpgmTable | undefined {
    return this.readTable('fpgm', (data) => FpgmTable.read(data));
  }

  get prep(): PrepTable | undefined {
    return this.readTable('prep', (data) => PrepTable.read(data));
  }

  get name(): NameTable | undefined {
    return this.readTable('name', (data) => NameTable.read(data));
  }

  get cmap(): CmapTable | undefined {
    return this.readTable('cmap', (data) => CmapTable.read(data));
  }

  get os2(): Os2Table | undefined {
    return this.readTable('OS/2', (data) => Os2Table.read(data));
  }

  get post(): PostTable | undefined {
    return this.readTable('post', (data) => PostTable.read(data));
  }

  get gsub(): GsubTable | undefined {
    return this.readTable('GSUB', (data) => GsubTable.read(data));
  }

  private readTable<T>(name: TableTag, reader: (data: DataView) => T): T | undefined {
    if (this.tables[name]) {
      return this.tables[name] as T;
    }
    const record = this.tableRecords[name];
    return record && reader(subDataView(this.data, record.offset, record.length));
  }
}
