import { type GlyphRun } from './glyph-run.ts';
import { type FeatureListTable } from './tables/common/feature-list.ts';
import { LookupFlags, type LookupListTable, type LookupTable } from './tables/common/lookup-list.ts';
import { type LangSysTable } from './tables/common/script-list.ts';
import { type GdefTable, GlyphClass } from './tables/gdef.ts';
import { type GposSubtable, type GposTable, readGposSubtable } from './tables/gpos.ts';
import { type GsubSubtable, type GsubTable, readGsubSubtable } from './tables/gsub.ts';
import { type HmtxTable } from './tables/hmtx.ts';

export type LayoutOptions = {
  scriptTag?: string;
  langSysTag?: string;
};

export class GsubProcessor {
  private readonly gsubTable: GsubTable;
  private readonly hmtxTable: HmtxTable;
  private readonly gdefTable: GdefTable | undefined;
  private readonly lookupsCache = new Map<number, LookupWithSubtables<GsubSubtable>[]>();

  constructor(gsubTable: GsubTable, hmtxTable: HmtxTable, gdefTable?: GdefTable) {
    this.gsubTable = gsubTable;
    this.hmtxTable = hmtxTable;
    this.gdefTable = gdefTable;
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
    const lookups = this.getLookupsByIndex(featureIndex);
    for (const lookup of lookups) {
      const skip = createSkipFn(lookup.lookupFlag, lookup.markFilteringSet, this.gdefTable);
      for (const subtable of lookup.subtables) {
        subtable.applyToGlyphRun(glyphRun, getAdvance, skip);
      }
    }
  }

  private getLookupsByIndex(featureIndex: number): LookupWithSubtables<GsubSubtable>[] {
    const cached = this.lookupsCache.get(featureIndex);
    if (cached) return cached;

    const lookups = getLookupsByIndex(this.gsubTable, readGsubSubtable, featureIndex);
    this.lookupsCache.set(featureIndex, lookups);
    return lookups;
  }
}

export class GposProcessor {
  private readonly gposTable: GposTable;
  private readonly gdefTable: GdefTable | undefined;
  private readonly lookupsCache = new Map<number, LookupWithSubtables<GposSubtable>[]>();

  constructor(gposTable: GposTable, gdefTable?: GdefTable) {
    this.gposTable = gposTable;
    this.gdefTable = gdefTable;
  }

  hasFeature(featureTag: string, options: LayoutOptions): boolean {
    const langSysTable = this.findLangSysTable(options);
    if (!langSysTable) return false;
    return this.getFeatureIndexByTag(langSysTable, featureTag) !== undefined;
  }

  apply(glyphRun: GlyphRun, features: string[], options: LayoutOptions): void {
    const langSysTable = this.findLangSysTable(options);
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

  private findLangSysTable(options: LayoutOptions): LangSysTable | undefined {
    const scriptTable = this.gposTable.findScriptTable(options.scriptTag);
    return scriptTable ? this.gposTable.findLangSysTable(scriptTable, options.langSysTag) : undefined;
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
    const lookups = this.getLookupsByIndex(featureIndex);
    for (const lookup of lookups) {
      const skip = createSkipFn(lookup.lookupFlag, lookup.markFilteringSet, this.gdefTable);
      for (const subtable of lookup.subtables) {
        subtable.applyToGlyphRun(glyphRun, skip);
      }
    }
  }

  private getLookupsByIndex(featureIndex: number): LookupWithSubtables<GposSubtable>[] {
    const cached = this.lookupsCache.get(featureIndex);
    if (cached) return cached;

    const lookups = getLookupsByIndex(this.gposTable, readGposSubtable, featureIndex);
    this.lookupsCache.set(featureIndex, lookups);
    return lookups;
  }
}

// === Lookup filtering ===

type LookupWithSubtables<T> = {
  readonly lookupFlag: number;
  readonly markFilteringSet: number | undefined;
  readonly subtables: T[];
};

/**
 * Creates a skip function for a lookup based on its flags and the GDEF
 * table. Returns undefined when the lookup has no filtering flags set.
 */
export function createSkipFn(
  lookupFlag: number,
  markFilteringSet: number | undefined,
  gdef: GdefTable | undefined,
): ((glyphId: number) => boolean) | undefined {
  const ignoreBaseGlyphs = (lookupFlag & LookupFlags.IGNORE_BASE_GLYPHS) !== 0;
  const ignoreLigatures = (lookupFlag & LookupFlags.IGNORE_LIGATURES) !== 0;
  const ignoreMarks = (lookupFlag & LookupFlags.IGNORE_MARKS) !== 0;
  const useMarkFilteringSet = (lookupFlag & LookupFlags.USE_MARK_FILTERING_SET) !== 0;
  const markAttachmentClass = (lookupFlag & LookupFlags.MARK_ATTACHMENT_CLASS_FILTER) >> 8;

  if (!ignoreBaseGlyphs && !ignoreLigatures && !ignoreMarks && !useMarkFilteringSet && markAttachmentClass === 0) {
    return undefined;
  }

  return (glyphId: number) =>
    shouldSkipGlyph(
      glyphId,
      gdef,
      ignoreBaseGlyphs,
      ignoreLigatures,
      ignoreMarks,
      useMarkFilteringSet,
      markFilteringSet,
      markAttachmentClass,
    );
}

function shouldSkipGlyph(
  glyphId: number,
  gdef: GdefTable | undefined,
  ignoreBaseGlyphs: boolean,
  ignoreLigatures: boolean,
  ignoreMarks: boolean,
  useMarkFilteringSet: boolean,
  markFilteringSet: number | undefined,
  markAttachmentClass: number,
): boolean {
  if (!gdef) return false;

  const glyphClass = gdef.getGlyphClass(glyphId);

  if (ignoreBaseGlyphs && glyphClass === GlyphClass.Base) return true;
  if (ignoreLigatures && glyphClass === GlyphClass.Ligature) return true;

  if (glyphClass === GlyphClass.Mark) {
    // USE_MARK_FILTERING_SET skips marks not in the set, regardless of IGNORE_MARKS
    if (useMarkFilteringSet && markFilteringSet !== undefined) {
      return !gdef.isMarkInSet(glyphId, markFilteringSet);
    }
    if (ignoreMarks) {
      if (markAttachmentClass !== 0) {
        return gdef.getMarkAttachClass(glyphId) !== markAttachmentClass;
      }
      return true;
    }
    // Even without IGNORE_MARKS, MARK_ATTACHMENT_CLASS_FILTER still applies
    if (markAttachmentClass !== 0) {
      return gdef.getMarkAttachClass(glyphId) !== markAttachmentClass;
    }
  }

  return false;
}

// === Shared helpers ===

function getLookupsByIndex<T>(
  table: { featureListTable: FeatureListTable; lookupListTable: LookupListTable },
  readSubtable: (lookupTable: LookupTable, index: number) => T | undefined,
  featureIndex: number,
): LookupWithSubtables<T>[] {
  const lookups: LookupWithSubtables<T>[] = [];

  const featureRec = table.featureListTable.featureRecords[featureIndex];
  const featureTable = featureRec.readFeatureTable();
  for (const lookupIndex of featureTable.lookupListIndices) {
    const lookupTable = table.lookupListTable.readLookupTable(lookupIndex);
    if (lookupTable === undefined) continue;

    const subtables: T[] = [];
    for (let i = 0; i < lookupTable.subTableCount; i++) {
      const subtable = readSubtable(lookupTable, i);
      if (subtable) subtables.push(subtable);
    }

    if (subtables.length > 0) {
      lookups.push({
        lookupFlag: lookupTable.lookupFlag,
        markFilteringSet: lookupTable.markFilteringSet,
        subtables,
      });
    }
  }

  return lookups;
}
