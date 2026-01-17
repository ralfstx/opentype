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

    const applied = new Set<number>();

    // Apply required feature first (if any)
    if (langSysTable.requiredFeatureIndex !== 0xffff) {
      this.applyFeatureByIndex(glyphRun, langSysTable.requiredFeatureIndex, getAdvance);
      applied.add(langSysTable.requiredFeatureIndex);
    }

    // Apply optional features in the defined order
    for (const featureTag of features) {
      const featureIndex = this.getFeatureIndexByTag(langSysTable, featureTag);
      if (featureIndex !== undefined && !applied.has(featureIndex)) {
        this.applyFeatureByIndex(glyphRun, featureIndex, getAdvance);
        applied.add(featureIndex);
      }
    }
  }

  private getFeatureIndexByTag(langSysTable: LangSysTable, featureTag: string): number | undefined {
    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = this.gsubTable.featureListTable.featureRecords[featureIndex];
      if (featureRec.featureTag === featureTag) {
        return featureIndex;
      }
    }
  }

  private applyFeatureByIndex(glyphRun: GlyphRun, featureIndex: number, getAdvance: (glyphId: number) => number): void {
    const subTables = this.getSubTablesByIndex(featureIndex);
    for (const subTable of subTables) {
      subTable.applyToGlyphRun(glyphRun, getAdvance);
    }
  }

  private getSubTablesByIndex(featureIndex: number): GsubSubtable[] {
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

    const applied = new Set<number>();

    // Apply required feature first (if any)
    if (langSysTable.requiredFeatureIndex !== 0xffff) {
      this.applyFeatureByIndex(glyphRun, langSysTable.requiredFeatureIndex);
      applied.add(langSysTable.requiredFeatureIndex);
    }

    // Apply optional features in the defined order
    for (const featureTag of features) {
      const featureIndex = this.getFeatureIndexByTag(langSysTable, featureTag);
      if (featureIndex !== undefined && !applied.has(featureIndex)) {
        this.applyFeatureByIndex(glyphRun, featureIndex);
        applied.add(featureIndex);
      }
    }
  }

  private getFeatureIndexByTag(langSysTable: LangSysTable, featureTag: string): number | undefined {
    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = this.gposTable.featureListTable.featureRecords[featureIndex];
      if (featureRec.featureTag === featureTag) {
        return featureIndex;
      }
    }
  }

  private applyFeatureByIndex(glyphRun: GlyphRun, featureIndex: number): void {
    const subTables = this.getSubTablesByIndex(featureIndex);
    for (const subTable of subTables) {
      subTable.applyToGlyphRun(glyphRun);
    }
  }

  private getSubTablesByIndex(featureIndex: number): GposSubtable[] {
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
