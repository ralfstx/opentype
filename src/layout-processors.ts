import { type GlyphRun } from './glyph-run.ts';
import { type FeatureListTable } from './tables/common/feature-list.ts';
import { LookupFlags, type LookupListTable, type LookupTable } from './tables/common/lookup-list.ts';
import { type LangSysTable } from './tables/common/script-list.ts';
import { type GdefTable, GlyphClass } from './tables/gdef.ts';
import {
  applyGposSubtablesAtIndex,
  type GposContext,
  type GposSubtable,
  type GposTable,
  readGposSubtable,
} from './tables/gpos.ts';
import {
  applyGsubSubtablesAtIndex,
  type ApplyLookupFn,
  type GsubSubtable,
  type GsubTable,
  readAllGsubSubtables,
} from './tables/gsub.ts';
import { type HmtxTable } from './tables/hmtx.ts';

/**
 * Maximum nesting level of lookups referenced by contextual lookups.
 */
const MAX_NESTING_LEVEL = 8;

/**
 * Limits the number of nested lookups per run to a multiple of the number
 * of glyphs, with a minimum, like HarfBuzz does. Guards against malformed
 * fonts whose contextual lookups expand exponentially.
 */
const NESTED_LOOKUPS_PER_GLYPH = 64;
const MIN_NESTED_LOOKUPS = 1024;

export type LayoutOptions = {
  scriptTag?: string;
  langSysTag?: string;
};

export class GsubProcessor {
  private readonly gsubTable: GsubTable;
  private readonly hmtxTable: HmtxTable;
  private readonly gdefTable: GdefTable | undefined;
  private readonly lookupsCache = new Map<number, LookupWithSubtables<GsubSubtable>[]>();
  private readonly innerLookupCache = new Map<
    number,
    { subtables: GsubSubtable[]; skip: ((glyphId: number) => boolean) | undefined }
  >();

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
        subtable.applyToGlyphRun(glyphRun, getAdvance, skip, this.applyLookup);
      }
    }
  }

  private readonly applyLookup: ApplyLookupFn = (lookupIndex, glyphRun, targetIndex, getAdvance) => {
    let cached = this.innerLookupCache.get(lookupIndex);
    if (!cached) {
      const lookupTable = this.gsubTable.lookupListTable.readLookupTable(lookupIndex);
      cached = {
        subtables: readAllGsubSubtables(lookupTable),
        skip: createSkipFn(lookupTable.lookupFlag, lookupTable.markFilteringSet, this.gdefTable),
      };
      this.innerLookupCache.set(lookupIndex, cached);
    }
    applyGsubSubtablesAtIndex(cached.subtables, glyphRun, targetIndex, getAdvance, cached.skip, this.applyLookup);
  };

  private getLookupsByIndex(featureIndex: number): LookupWithSubtables<GsubSubtable>[] {
    const cached = this.lookupsCache.get(featureIndex);
    if (cached) return cached;

    const lookups = getGsubLookupsByIndex(this.gsubTable, featureIndex);
    this.lookupsCache.set(featureIndex, lookups);
    return lookups;
  }
}

export class GposProcessor {
  private readonly gposTable: GposTable;
  private readonly gdefTable: GdefTable | undefined;
  private readonly lookupIndicesCache = new Map<number, readonly number[]>();
  private readonly lookupCache = new Map<number, LookupWithSubtables<GposSubtable> | undefined>();
  private readonly isMark: ((glyphId: number) => boolean) | undefined;
  private remainingNestedLookups = 0;

  constructor(gposTable: GposTable, gdefTable?: GdefTable) {
    this.gposTable = gposTable;
    this.gdefTable = gdefTable;
    this.isMark = gdefTable && ((glyphId) => gdefTable.getGlyphClass(glyphId) === GlyphClass.Mark);
  }

  hasFeature(featureTag: string, options: LayoutOptions): boolean {
    const langSysTable = this.findLangSysTable(options);
    if (!langSysTable) return false;
    return this.getFeatureIndexByTag(langSysTable, featureTag) !== undefined;
  }

  apply(glyphRun: GlyphRun, features: string[], options: LayoutOptions): Map<number, number> {
    const markAttachments = new Map<number, number>();
    const langSysTable = this.findLangSysTable(options);
    if (!langSysTable) return markAttachments;

    this.remainingNestedLookups = Math.max(MIN_NESTED_LOOKUPS, NESTED_LOOKUPS_PER_GLYPH * glyphRun.glyphs.length);

    const applied = new Set<number>();

    // Apply required feature first (if any)
    if (langSysTable.requiredFeatureIndex !== 0xffff) {
      this.applyFeatureByIndex(glyphRun, langSysTable.requiredFeatureIndex, markAttachments);
      applied.add(langSysTable.requiredFeatureIndex);
    }

    // Apply optional features in the defined order
    for (const featureTag of features) {
      const featureIndex = this.getFeatureIndexByTag(langSysTable, featureTag);
      if (featureIndex !== undefined && !applied.has(featureIndex)) {
        this.applyFeatureByIndex(glyphRun, featureIndex, markAttachments);
        applied.add(featureIndex);
      }
    }

    return markAttachments;
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

  private applyFeatureByIndex(glyphRun: GlyphRun, featureIndex: number, markAttachments: Map<number, number>): void {
    for (const lookupIndex of this.getLookupIndices(featureIndex)) {
      const lookup = this.getLookup(lookupIndex);
      if (!lookup) continue;
      const context = this.createContext(lookup, markAttachments, 0);
      // Continue after the glyphs a subtable applied to, e.g. after the
      // entire input sequence of a contextual rule
      for (let i = 0; i < glyphRun.glyphs.length;) {
        i = applyGposSubtablesAtIndex(lookup.subtables, glyphRun, i, context) ?? i + 1;
      }
    }
  }

  private createContext(
    lookup: LookupWithSubtables<GposSubtable>,
    markAttachments: Map<number, number>,
    nestingLevel: number,
  ): GposContext {
    return {
      skip: createSkipFn(lookup.lookupFlag, lookup.markFilteringSet, this.gdefTable),
      isMark: this.isMark,
      markAttachments,
      applyLookup: (lookupIndex, glyphRun, index) => {
        // Guard against malformed fonts with cyclic lookup references
        if (nestingLevel >= MAX_NESTING_LEVEL || this.remainingNestedLookups <= 0) return;
        this.remainingNestedLookups--;
        const nestedLookup = this.getLookup(lookupIndex);
        if (!nestedLookup) return;
        const nestedContext = this.createContext(nestedLookup, markAttachments, nestingLevel + 1);
        applyGposSubtablesAtIndex(nestedLookup.subtables, glyphRun, index, nestedContext);
      },
    };
  }

  private getLookupIndices(featureIndex: number): readonly number[] {
    let lookupIndices = this.lookupIndicesCache.get(featureIndex);
    if (!lookupIndices) {
      const featureRec = this.gposTable.featureListTable.featureRecords[featureIndex];
      lookupIndices = featureRec.readFeatureTable().lookupListIndices;
      this.lookupIndicesCache.set(featureIndex, lookupIndices);
    }
    return lookupIndices;
  }

  private getLookup(lookupIndex: number): LookupWithSubtables<GposSubtable> | undefined {
    if (!this.lookupCache.has(lookupIndex)) {
      this.lookupCache.set(lookupIndex, readLookup(this.gposTable.lookupListTable, readGposSubtable, lookupIndex));
    }
    return this.lookupCache.get(lookupIndex);
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

function readLookup<T>(
  lookupListTable: LookupListTable,
  readSubtable: (lookupTable: LookupTable, index: number) => T | undefined,
  lookupIndex: number,
): LookupWithSubtables<T> | undefined {
  const lookupTable = lookupListTable.readLookupTable(lookupIndex);
  if (lookupTable === undefined) return undefined;

  const subtables: T[] = [];
  for (let i = 0; i < lookupTable.subTableCount; i++) {
    const subtable = readSubtable(lookupTable, i);
    if (subtable) subtables.push(subtable);
  }
  if (subtables.length === 0) return undefined;

  return {
    lookupFlag: lookupTable.lookupFlag,
    markFilteringSet: lookupTable.markFilteringSet,
    subtables,
  };
}

/**
 * GSUB-specific variant that uses `readAllGsubSubtables` to consolidate
 * Type 6 (chaining contextual) subtables into a single instance, so that
 * rules are tried in priority order at each glyph position.
 */
function getGsubLookupsByIndex(
  table: { featureListTable: FeatureListTable; lookupListTable: LookupListTable },
  featureIndex: number,
): LookupWithSubtables<GsubSubtable>[] {
  const lookups: LookupWithSubtables<GsubSubtable>[] = [];

  const featureRec = table.featureListTable.featureRecords[featureIndex];
  const featureTable = featureRec.readFeatureTable();
  for (const lookupIndex of featureTable.lookupListIndices) {
    const lookupTable = table.lookupListTable.readLookupTable(lookupIndex);
    if (lookupTable === undefined) continue;

    const subtables = readAllGsubSubtables(lookupTable);
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
