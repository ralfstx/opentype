import { subDataView } from './data-reader.ts';
import { type TableRecord } from './table-records.ts';
import { CmapTable } from './tables/cmap.ts';
import { GlyfTable } from './tables/glyf.ts';
import { GposTable } from './tables/gpos.ts';
import { GsubTable } from './tables/gsub.ts';
import { HeadTable } from './tables/head.ts';
import { HheaTable } from './tables/hhea.ts';
import { HmtxTable } from './tables/hmtx.ts';
import { LocaTable } from './tables/loca.ts';
import { MaxpTable } from './tables/maxp.ts';
import { NameTable } from './tables/name.ts';
import { Os2Table } from './tables/os2.ts';
import { PostTable } from './tables/post.ts';

export type TableTag =
  | 'head'
  | 'hhea'
  | 'hmtx'
  | 'name'
  | 'post'
  | 'glyf'
  | 'loca'
  | 'maxp'
  | 'cmap'
  | 'GPOS'
  | 'GSUB'
  | 'OS/2';

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

  get name(): NameTable | undefined {
    return this.readTable('name', (data) => NameTable.read(data));
  }

  get cmap(): CmapTable | undefined {
    return this.readTable('cmap', (data) => CmapTable.read(data));
  }

  get 'OS/2'(): Os2Table | undefined {
    return this.readTable('OS/2', (data) => Os2Table.read(data));
  }

  get post(): PostTable | undefined {
    return this.readTable('post', (data) => PostTable.read(data));
  }

  get GSUB(): GsubTable | undefined {
    return this.readTable('GSUB', (data) => GsubTable.read(data));
  }

  get GPOS(): GposTable | undefined {
    return this.readTable('GPOS', (data) => GposTable.read(data));
  }

  get glyf(): GlyfTable | undefined {
    const maxp = this.maxp;
    const loca = this.loca;
    if (!maxp || !loca) return undefined;
    return this.readTable('glyf', (data) => GlyfTable.read(data, maxp, loca));
  }

  private readTable<T>(name: TableTag, reader: (data: DataView) => T): T | undefined {
    if (this.tables[name]) {
      return this.tables[name] as T;
    }
    const record = this.tableRecords[name];
    return record && reader(subDataView(this.data, record.offset, record.length));
  }
}
