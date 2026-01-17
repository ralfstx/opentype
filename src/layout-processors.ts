import { type GlyphRun } from './glyph-run.ts';
import { type FeatureListTable } from './tables/common/feature-list.ts';
import { type LookupListTable, type LookupTable } from './tables/common/lookup-list.ts';
import { type LangSysTable } from './tables/common/script-list.ts';
import { type GposSubtable, type GposTable, readGposSubtable } from './tables/gpos.ts';
import { type GsubSubtable, type GsubTable, readGsubSubtable } from './tables/gsub.ts';
import { type HmtxTable } from './tables/hmtx.ts';

export type LayoutOptions = {
  scriptTag?: string;
  langSysTag?: string;
};

export class GsubProcessor {
  readonly gsubTable: GsubTable;
  readonly hmtxTable: HmtxTable;
  private readonly subTablesCache = new Map<number, GsubSubtable[]>();

  constructor(gsubTable: GsubTable, hmtxTable: HmtxTable) {
    this.gsubTable = gsubTable;
    this.hmtxTable = hmtxTable;
  }

  apply(glyphRun: GlyphRun, features: string[], options: LayoutOptions): void {
    const scriptTable = this.gsubTable.findScriptTable(options.scriptTag);
    const langSysTable = scriptTable && this.gsubTable.findLangSysTable(scriptTable, options.langSysTag);
    if (!langSysTable) return;

    const getAdvance = (glyphId: number) => this.hmtxTable.hMetrics.at(glyphId)?.advanceWidth ?? 0;

    // Apply features in the defined order
    for (const featureTag of features) {
      const subTables = this.getSubTablesByTag(langSysTable, featureTag);
      for (const subTable of subTables) {
        subTable.applyToGlyphRun(glyphRun, getAdvance);
      }
    }
  }

  private getSubTablesByTag(langSysTable: LangSysTable, featureTag: string): GsubSubtable[] {
    const subTables: GsubSubtable[] = [];

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = this.gsubTable.featureListTable.featureRecords[featureIndex];
      if (featureRec.featureTag === featureTag) {
        subTables.push(...this.getGsubSubTablesByIndex(featureIndex));
      }
    }

    return subTables;
  }

  private getGsubSubTablesByIndex(featureIndex: number): GsubSubtable[] {
    const cached = this.subTablesCache.get(featureIndex);
    if (cached) {
      return cached;
    }

    const subTables = getSubTablesByIndex(this.gsubTable, readGsubSubtable, featureIndex);
    this.subTablesCache.set(featureIndex, subTables);
    return subTables;
  }
}

export class GposProcessor {
  readonly gposTable: GposTable;
  private readonly subTablesCache = new Map<number, GposSubtable[]>();

  constructor(gposTable: GposTable) {
    this.gposTable = gposTable;
  }

  apply(glyphRun: GlyphRun, features: string[], options: LayoutOptions): void {
    const scriptTable = this.gposTable.findScriptTable(options.scriptTag);
    const langSysTable = scriptTable && this.gposTable.findLangSysTable(scriptTable, options.langSysTag);
    if (!langSysTable) return;

    // Apply features in the defined order
    for (const featureTag of features) {
      const subTables = this.getGposSubTablesByTag(langSysTable, featureTag);
      for (const subTable of subTables) {
        subTable.applyToGlyphRun(glyphRun);
      }
    }
  }

  private getGposSubTablesByTag(langSysTable: LangSysTable, featureTag: string): GposSubtable[] {
    const subTables: GposSubtable[] = [];

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = this.gposTable.featureListTable.featureRecords[featureIndex];
      if (featureRec.featureTag === featureTag) {
        subTables.push(...this.getGposSubTablesByIndex(featureIndex));
      }
    }

    return subTables;
  }

  private getGposSubTablesByIndex(featureIndex: number): GposSubtable[] {
    const cached = this.subTablesCache.get(featureIndex);
    if (cached) {
      return cached;
    }

    const subTables = getSubTablesByIndex(this.gposTable, readGposSubtable, featureIndex);
    this.subTablesCache.set(featureIndex, subTables);
    return subTables;
  }
}

function getSubTablesByIndex<T>(
  table: { featureListTable: FeatureListTable; lookupListTable: LookupListTable },
  readSubtable: (lookupTable: LookupTable, index: number) => T | undefined,
  featureIndex: number,
): T[] {
  const subTables: T[] = [];

  const featureRec = table.featureListTable.featureRecords[featureIndex];
  const featureTable = featureRec.readFeatureTable();
  for (const lookupIndex of featureTable.lookupListIndices) {
    const lookupTable = table.lookupListTable.readLookupTable(lookupIndex);
    if (lookupTable === undefined) continue;
    for (let i = 0; i < lookupTable.subTableCount; i++) {
      const subTable = readSubtable(lookupTable, i);
      if (subTable) subTables.push(subTable);
    }
  }

  return subTables;
}
