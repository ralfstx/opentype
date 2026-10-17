import { DataReader, subDataView } from '../data-reader.ts';
import { type GlyphRun, type ShapedGlyph } from '../glyph-run.ts';
import { ClassDefTable } from './common/classdef.ts';
import { type ContextRule, readChainingContextRules, readContextRules } from './common/context.ts';
import { CoverageTable } from './common/coverage.ts';
import { FeatureListTable, type FeatureTable } from './common/feature-list.ts';
import { LookupListTable, type LookupTable } from './common/lookup-list.ts';
import { type LangSysTable, ScriptListTable, type ScriptTable } from './common/script-list.ts';

/**
 * The 'GPOS' table provides glyph positioning information for advanced typography.
 */
export class GposTable {
  private readonly data: DataView;
  /** The script list table in this 'GPOS' table. */
  readonly scriptListTable: ScriptListTable;
  /** The feature list table in this 'GPOS' table. */
  readonly featureListTable: FeatureListTable;
  /** The lookup list table in this 'GPOS' table. */
  readonly lookupListTable: LookupListTable;

  /**
   * Reads a 'GPOS' table from the given DataView.
   */
  static read(data: DataView) {
    return new GposTable(data);
  }

  private constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    const majorVersion = reader.readUint16();
    if (majorVersion !== 1) {
      throw new Error(`Unsupported GPOS table version ${majorVersion}`);
    }
    const minorVersion = reader.readUint16();
    if (minorVersion !== 0 && minorVersion !== 1) {
      throw new Error(`Unsupported GPOS table version ${majorVersion}.${minorVersion}`);
    }
    const scriptListOffset = reader.readUint16();
    const featureListOffset = reader.readUint16();
    const lookupListOffset = reader.readUint16();
    if (minorVersion === 1) reader.readUint32(); // featureVariationsOffset

    this.scriptListTable = ScriptListTable.read(subDataView(this.data, scriptListOffset));
    this.featureListTable = FeatureListTable.read(subDataView(this.data, featureListOffset));
    this.lookupListTable = LookupListTable.read(subDataView(this.data, lookupListOffset));
  }

  findScriptTable(scriptTag = 'DFLT'): ScriptTable | undefined {
    const scriptRecord =
      this.scriptListTable.scriptRecords.find((record) => record.scriptTag === scriptTag) ??
      this.scriptListTable.scriptRecords.find((record) => record.scriptTag === 'DFLT');
    return scriptRecord?.readScriptTable();
  }

  findLangSysTable(scriptTable: ScriptTable, langSysTag: string | undefined): LangSysTable | undefined {
    const langSysRecord = langSysTag
      ? scriptTable.langSysRecords.find((record) => record.langSysTag === langSysTag)
      : undefined;
    return langSysRecord?.readLangSysTable() ?? scriptTable.defaultLangSysTable;
  }

  findFeatureTables(featureTag: string): FeatureTable[] {
    const featureRecords = this.featureListTable.featureRecords.filter((record) => record.featureTag === featureTag);
    return featureRecords.map((rec) => rec.readFeatureTable());
  }
}

/**
 * Context for applying GPOS subtables to a glyph run.
 */
export type GposContext = {
  /** Returns true for glyphs that the current lookup ignores. */
  readonly skip?: ((glyphId: number) => boolean) | undefined;
  /** Returns true for mark glyphs, as classified by the GDEF table. */
  readonly isMark?: ((glyphId: number) => boolean) | undefined;
  /** Records the index of the glyph that each mark glyph is attached to. */
  readonly markAttachments?: Map<number, number> | undefined;
  /** Applies the lookup with the given index at a glyph position. */
  readonly applyLookup?: ((lookupIndex: number, glyphRun: GlyphRun, index: number) => void) | undefined;
};

// VALUE RECORDS

type ValueRecord = {
  xPlacement?: number | undefined;
  yPlacement?: number | undefined;
  xAdvance?: number | undefined;
  yAdvance?: number | undefined;
  xPlacementDeviceOffset?: number | undefined;
  yPlacementDeviceOffset?: number | undefined;
  xAdvanceDeviceOffset?: number | undefined;
  yAdvanceDeviceOffset?: number | undefined;
};

function readValueRecord(reader: DataReader, valueFormat: number): ValueRecord {
  const record: ValueRecord = {};

  if (valueFormat & 0x0001) {
    record.xPlacement = reader.readInt16();
  }
  if (valueFormat & 0x0002) {
    record.yPlacement = reader.readInt16();
  }
  if (valueFormat & 0x0004) {
    record.xAdvance = reader.readInt16();
  }
  if (valueFormat & 0x0008) {
    record.yAdvance = reader.readInt16();
  }
  if (valueFormat & 0x0010) {
    record.xPlacementDeviceOffset = reader.readUint16();
  }
  if (valueFormat & 0x0020) {
    record.yPlacementDeviceOffset = reader.readUint16();
  }
  if (valueFormat & 0x0040) {
    record.xAdvanceDeviceOffset = reader.readUint16();
  }
  if (valueFormat & 0x0080) {
    record.yAdvanceDeviceOffset = reader.readUint16();
  }

  return record;
}

/**
 * Applies a value record to a glyph, modifying its offset and advance values.
 * For performance reasons, the glyph is modified in place.
 */
function applyValueRecord(glyph: ShapedGlyph, valueRecord: ValueRecord): void {
  if (valueRecord.xPlacement) {
    glyph.xOffset = (glyph.xOffset ?? 0) + valueRecord.xPlacement;
  }
  if (valueRecord.yPlacement) {
    glyph.yOffset = (glyph.yOffset ?? 0) + valueRecord.yPlacement;
  }
  if (valueRecord.xAdvance) {
    glyph.advanceAdjust = (glyph.advanceAdjust ?? 0) + valueRecord.xAdvance;
  }
  // Note: yAdvance is intentionally ignored for horizontal text layout
}

// === SUBTABLES ===

export function readGposSubtable(lookupTable: LookupTable, subtableIndex: number): GposSubtable | undefined {
  let type = lookupTable.lookupType;
  let data = lookupTable.getSubTableData(subtableIndex);

  // Unwrap extension subtable (type 9)
  if (type === 9) {
    const reader = new DataReader(data);
    const format = reader.readUint16();
    if (format !== 1) {
      throw new Error(`Unsupported GPOS extension subtable format ${format}`);
    }
    type = reader.readUint16(); // extensionLookupType
    const extensionOffset = reader.readUint32();
    data = subDataView(data, extensionOffset);
  }

  if (type === 1) {
    return GposSinglePosSubtable.read(data);
  }
  if (type === 2) {
    return GposPairPosSubtable.read(data);
  }
  if (type === 4) {
    return GposMarkBasePosSubtable.read(data);
  }
  if (type === 5) {
    return GposMarkLigPosSubtable.read(data);
  }
  if (type === 6) {
    return GposMarkMarkPosSubtable.read(data);
  }
  if (type === 7) {
    return GposContextPosSubtable.read(data);
  }
  if (type === 8) {
    return GposContextPosSubtable.readChaining(data);
  }
}

export type GposSubtable =
  | GposSinglePosSubtable
  | GposPairPosSubtable
  | GposMarkBasePosSubtable
  | GposMarkLigPosSubtable
  | GposMarkMarkPosSubtable
  | GposContextPosSubtable;

/**
 * Tries to apply a list of GPOS subtables at a specific glyph position.
 * Subtables are tried in order; the first one that applies wins.
 * Returns the position to continue at, or undefined if no subtable
 * applied.
 */
export function applyGposSubtablesAtIndex(
  subtables: GposSubtable[],
  glyphRun: GlyphRun,
  index: number,
  context: GposContext,
): number | undefined {
  for (const subtable of subtables) {
    const next = subtable.applyAtIndex(glyphRun, index, context);
    if (next !== undefined) return next;
  }
  return undefined;
}

/**
 * Lookup type 1 subtable: single adjustment positioning
 */
export class GposSinglePosSubtable {
  private readonly isFormat1: boolean;
  readonly coverageTable: CoverageTable;
  readonly valueRecords: ValueRecord[];

  static read(data: DataView): GposSinglePosSubtable {
    return new GposSinglePosSubtable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const format = reader.readUint16();
    if (format !== 1 && format !== 2) {
      throw new Error(`Unsupported GPOS single pos subtable format ${format}`);
    }
    this.isFormat1 = format === 1;

    const coverageOffset = reader.readUint16();
    const valueFormat = reader.readUint16();

    if (this.isFormat1) {
      const valueRecord = readValueRecord(reader, valueFormat);
      this.valueRecords = [valueRecord];
    } else {
      const valueCount = reader.readUint16();
      this.valueRecords = Array.from({ length: valueCount }, () => readValueRecord(reader, valueFormat));
    }
    this.coverageTable = CoverageTable.read(subDataView(data, coverageOffset));
  }

  /**
   * Applies the subtable's value records to a glyph sequence.
   * For performance reasons, the glyphs are modified in place.
   */
  applyToGlyphRun(glyphRun: GlyphRun, context: GposContext = {}): void {
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, context);
    }
  }

  /**
   * Tries to apply the subtable to the glyph at the given position.
   * Returns the position to continue at, or undefined if not applied.
   */
  applyAtIndex(glyphRun: GlyphRun, index: number, context: GposContext = {}): number | undefined {
    const { skip } = context;
    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return undefined;

    const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
    if (coverageIndex === -1) return undefined;

    // For format 1, there is only one value record, so we ignore the coverage index
    const valueRecord = this.isFormat1 ? this.valueRecords[0] : this.valueRecords[coverageIndex];
    if (!valueRecord) {
      throw new Error(`Value record not found for coverage index ${coverageIndex}`);
    }
    applyValueRecord(glyph, valueRecord);
    return index + 1;
  }
}

/**
 * Lookup type 2 subtable: pair adjustment positioning
 */
export class GposPairPosSubtable {
  readonly coverageTable: CoverageTable;
  readonly pairSets?: PairSet[];
  readonly classDef1?: ClassDefTable;
  readonly classDef2?: ClassDefTable;
  readonly class1Records?: Class1Record[];

  static read(data: DataView): GposPairPosSubtable {
    return new GposPairPosSubtable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const format = reader.readUint16();
    const coverageOffset = reader.readUint16();
    const valueFormat1 = reader.readUint16();
    const valueFormat2 = reader.readUint16();

    if (format === 1) {
      const pairSetCount = reader.readUint16();
      const pairSetOffsets = Array.from({ length: pairSetCount }, () => reader.readUint16());
      this.pairSets = pairSetOffsets.map((offset) => {
        const pairSetReader = new DataReader(subDataView(data, offset));
        const pairValueCount = pairSetReader.readUint16();
        const pairs = Array.from({ length: pairValueCount }, () => {
          const secondGlyph = pairSetReader.readUint16();
          const valueRecord1 = readValueRecord(pairSetReader, valueFormat1);
          const valueRecord2 = readValueRecord(pairSetReader, valueFormat2);
          return { secondGlyph, valueRecord1, valueRecord2 };
        });
        return { pairs };
      });
    } else if (format === 2) {
      const classDef1Offset = reader.readUint16();
      const classDef2Offset = reader.readUint16();
      const class1Count = reader.readUint16();
      const class2Count = reader.readUint16();

      this.classDef1 = ClassDefTable.read(subDataView(data, classDef1Offset));
      this.classDef2 = ClassDefTable.read(subDataView(data, classDef2Offset));

      this.class1Records = Array.from({ length: class1Count }, () => {
        return Array.from({ length: class2Count }, () => {
          const valueRecord1 = readValueRecord(reader, valueFormat1);
          const valueRecord2 = readValueRecord(reader, valueFormat2);
          return { valueRecord1, valueRecord2 };
        });
      });
    } else {
      throw new Error(`Unsupported GPOS pair pos subtable format ${format}`);
    }

    this.coverageTable = CoverageTable.read(subDataView(data, coverageOffset));
  }

  applyToGlyphRun(glyphRun: GlyphRun, context: GposContext = {}): void {
    for (let i = 0; i < glyphRun.glyphs.length - 1; i++) {
      this.applyAtIndex(glyphRun, i, context);
    }
  }

  /**
   * Tries to apply the subtable to the pair starting at the given position.
   * Returns the position to continue at, or undefined if no pair matched.
   */
  applyAtIndex(glyphRun: GlyphRun, index: number, context: GposContext = {}): number | undefined {
    const { skip } = context;
    const firstGlyph = glyphRun.glyphs[index];
    if (!firstGlyph || skip?.(firstGlyph.glyphId)) return undefined;

    const coverageIndex = this.coverageTable.lookupGlyphId(firstGlyph.glyphId);
    if (coverageIndex === -1) return undefined;

    // Find next non-skipped glyph as second glyph
    const secondGlyph = findNextGlyph(glyphRun, index, skip);
    if (!secondGlyph) return undefined;

    if (this.pairSets) {
      const pair = this.pairSets[coverageIndex]?.pairs.find((p) => p.secondGlyph === secondGlyph.glyphId);
      if (!pair) return undefined;

      applyValueRecord(firstGlyph, pair.valueRecord1);
      applyValueRecord(secondGlyph, pair.valueRecord2);
      return index + 1;
    }

    if (this.classDef1 && this.classDef2 && this.class1Records) {
      const class1 = this.classDef1.lookup(firstGlyph.glyphId);
      if (class1 === undefined) return undefined;

      const class2 = this.classDef2.lookup(secondGlyph.glyphId);
      if (class2 === undefined) return undefined;

      const class2Record = this.class1Records[class1]?.[class2];
      if (!class2Record) return undefined;

      applyValueRecord(firstGlyph, class2Record.valueRecord1);
      applyValueRecord(secondGlyph, class2Record.valueRecord2);
      return index + 1;
    }

    return undefined;
  }
}

type PairSet = {
  pairs: {
    secondGlyph: number;
    valueRecord1: ValueRecord;
    valueRecord2: ValueRecord;
  }[];
};

type Class1Record = {
  valueRecord1: ValueRecord;
  valueRecord2: ValueRecord;
}[];

/**
 * Lookup type 4 subtable: mark-to-base attachment positioning
 *
 * Positions combining marks with respect to base glyphs by aligning
 * anchor points. Each mark has a class and an anchor; each base glyph
 * defines one anchor per mark class.
 */
export class GposMarkBasePosSubtable {
  readonly markCoverage: CoverageTable;
  readonly baseCoverage: CoverageTable;
  readonly markArray: MarkRecord[];
  readonly baseArray: (AnchorPoint | null)[][];

  static read(data: DataView): GposMarkBasePosSubtable {
    return new GposMarkBasePosSubtable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const format = reader.readUint16();
    if (format !== 1) {
      throw new Error(`Unsupported MarkBasePos subtable format ${format}`);
    }

    const markCoverageOffset = reader.readUint16();
    const baseCoverageOffset = reader.readUint16();
    const markClassCount = reader.readUint16();
    const markArrayOffset = reader.readUint16();
    const baseArrayOffset = reader.readUint16();

    this.markCoverage = CoverageTable.read(subDataView(data, markCoverageOffset));
    this.baseCoverage = CoverageTable.read(subDataView(data, baseCoverageOffset));
    this.markArray = readMarkArray(subDataView(data, markArrayOffset));
    this.baseArray = readBaseArray(subDataView(data, baseArrayOffset), markClassCount);
  }

  applyToGlyphRun(glyphRun: GlyphRun, context: GposContext = {}): void {
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, context);
    }
  }

  /**
   * Tries to attach the mark glyph at the given position to the preceding
   * base glyph. Returns the position to continue at, or undefined if the
   * mark was not attached.
   */
  applyAtIndex(glyphRun: GlyphRun, index: number, context: GposContext = {}): number | undefined {
    const { skip, markAttachments } = context;
    const markGlyph = glyphRun.glyphs[index];
    if (!markGlyph || skip?.(markGlyph.glyphId)) return undefined;

    const markIndex = this.markCoverage.lookupGlyphId(markGlyph.glyphId);
    if (markIndex === -1) return undefined;

    const markRecord = this.markArray[markIndex];
    if (!markRecord?.anchor) return undefined;

    // Look backward for the preceding base glyph. Like other shaping
    // engines, ignore all marks here, independent of the lookup flags.
    const base = findPreviousUnskipped(glyphRun, index, (glyphId) => !!skip?.(glyphId) || !!context.isMark?.(glyphId));
    if (!base) return undefined;

    const baseIndex = this.baseCoverage.lookupGlyphId(base.glyph.glyphId);
    if (baseIndex === -1) return undefined;

    const baseAnchor = this.baseArray[baseIndex]?.[markRecord.markClass];
    if (!baseAnchor) return undefined;

    attachMark(markGlyph, markRecord.anchor, base.glyph, baseAnchor);
    markAttachments?.set(index, base.index);
    return index + 1;
  }
}

/**
 * Lookup type 5 subtable: mark-to-ligature attachment positioning
 *
 * Positions combining marks with respect to ligature glyphs. A ligature
 * defines anchors for each of its components, e.g. for the "f" and the "i"
 * of an "fi" ligature.
 *
 * The component a mark belongs to is not tracked during substitution.
 * Marks are attached to the last component, which is correct for marks
 * that follow the ligature in the input text.
 */
export class GposMarkLigPosSubtable {
  readonly markCoverage: CoverageTable;
  readonly ligatureCoverage: CoverageTable;
  readonly markArray: MarkRecord[];
  /** Anchors per ligature, per component, per mark class. */
  readonly ligatureArray: (AnchorPoint | null)[][][];

  static read(data: DataView): GposMarkLigPosSubtable {
    return new GposMarkLigPosSubtable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const format = reader.readUint16();
    if (format !== 1) {
      throw new Error(`Unsupported MarkLigPos subtable format ${format}`);
    }

    const markCoverageOffset = reader.readUint16();
    const ligatureCoverageOffset = reader.readUint16();
    const markClassCount = reader.readUint16();
    const markArrayOffset = reader.readUint16();
    const ligatureArrayOffset = reader.readUint16();

    this.markCoverage = CoverageTable.read(subDataView(data, markCoverageOffset));
    this.ligatureCoverage = CoverageTable.read(subDataView(data, ligatureCoverageOffset));
    this.markArray = readMarkArray(subDataView(data, markArrayOffset));
    this.ligatureArray = readLigatureArray(subDataView(data, ligatureArrayOffset), markClassCount);
  }

  applyToGlyphRun(glyphRun: GlyphRun, context: GposContext = {}): void {
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, context);
    }
  }

  /**
   * Tries to attach the mark glyph at the given position to the preceding
   * ligature glyph. Returns the position to continue at, or undefined if
   * the mark was not attached.
   */
  applyAtIndex(glyphRun: GlyphRun, index: number, context: GposContext = {}): number | undefined {
    const { skip, markAttachments } = context;
    const markGlyph = glyphRun.glyphs[index];
    if (!markGlyph || skip?.(markGlyph.glyphId)) return undefined;

    const markIndex = this.markCoverage.lookupGlyphId(markGlyph.glyphId);
    if (markIndex === -1) return undefined;

    const markRecord = this.markArray[markIndex];
    if (!markRecord?.anchor) return undefined;

    // Look backward for the preceding ligature glyph, ignoring all marks
    const ligature = findPreviousUnskipped(
      glyphRun,
      index,
      (glyphId) => !!skip?.(glyphId) || !!context.isMark?.(glyphId),
    );
    if (!ligature) return undefined;

    const ligatureIndex = this.ligatureCoverage.lookupGlyphId(ligature.glyph.glyphId);
    if (ligatureIndex === -1) return undefined;

    const components = this.ligatureArray[ligatureIndex];
    const ligatureAnchor = components?.at(-1)?.[markRecord.markClass];
    if (!ligatureAnchor) return undefined;

    attachMark(markGlyph, markRecord.anchor, ligature.glyph, ligatureAnchor);
    markAttachments?.set(index, ligature.index);
    return index + 1;
  }
}

/**
 * Lookup type 6 subtable: mark-to-mark attachment positioning
 *
 * Positions a combining mark (mark1) with respect to a preceding mark
 * (mark2), e.g. to stack diacritics. Works like mark-to-base attachment,
 * with the preceding mark taking the role of the base glyph.
 */
export class GposMarkMarkPosSubtable {
  readonly mark1Coverage: CoverageTable;
  readonly mark2Coverage: CoverageTable;
  readonly mark1Array: MarkRecord[];
  readonly mark2Array: (AnchorPoint | null)[][];

  static read(data: DataView): GposMarkMarkPosSubtable {
    return new GposMarkMarkPosSubtable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const format = reader.readUint16();
    if (format !== 1) {
      throw new Error(`Unsupported MarkMarkPos subtable format ${format}`);
    }

    const mark1CoverageOffset = reader.readUint16();
    const mark2CoverageOffset = reader.readUint16();
    const markClassCount = reader.readUint16();
    const mark1ArrayOffset = reader.readUint16();
    const mark2ArrayOffset = reader.readUint16();

    this.mark1Coverage = CoverageTable.read(subDataView(data, mark1CoverageOffset));
    this.mark2Coverage = CoverageTable.read(subDataView(data, mark2CoverageOffset));
    this.mark1Array = readMarkArray(subDataView(data, mark1ArrayOffset));
    // The Mark2Array has the same layout as the BaseArray
    this.mark2Array = readBaseArray(subDataView(data, mark2ArrayOffset), markClassCount);
  }

  applyToGlyphRun(glyphRun: GlyphRun, context: GposContext = {}): void {
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, context);
    }
  }

  /**
   * Tries to attach the mark glyph at the given position to the preceding
   * mark glyph. Returns the position to continue at, or undefined if the
   * mark was not attached.
   */
  applyAtIndex(glyphRun: GlyphRun, index: number, context: GposContext = {}): number | undefined {
    const { skip, markAttachments } = context;
    const mark1Glyph = glyphRun.glyphs[index];
    if (!mark1Glyph || skip?.(mark1Glyph.glyphId)) return undefined;

    const mark1Index = this.mark1Coverage.lookupGlyphId(mark1Glyph.glyphId);
    if (mark1Index === -1) return undefined;

    const mark1Record = this.mark1Array[mark1Index];
    if (!mark1Record?.anchor) return undefined;

    // Look backward for the preceding non-skipped glyph
    const mark2 = findPreviousUnskipped(glyphRun, index, skip);
    if (!mark2) return undefined;

    const mark2Index = this.mark2Coverage.lookupGlyphId(mark2.glyph.glyphId);
    if (mark2Index === -1) return undefined;

    const mark2Anchor = this.mark2Array[mark2Index]?.[mark1Record.markClass];
    if (!mark2Anchor) return undefined;

    attachMark(mark1Glyph, mark1Record.anchor, mark2.glyph, mark2Anchor);
    markAttachments?.set(index, mark2.index);
    return index + 1;
  }
}

/**
 * Lookup type 7 and 8 subtable: contextual and chaining contextual
 * positioning
 *
 * Matches an input sequence of glyphs, for type 8 also with backtrack and
 * lookahead contexts, and applies referenced lookups to specific glyphs
 * within the input sequence.
 */
export class GposContextPosSubtable {
  private readonly rules: ContextRule[];

  /** Reads a context positioning subtable (lookup type 7). */
  static read(data: DataView): GposContextPosSubtable | undefined {
    const rules = readContextRules(data);
    return rules.length > 0 ? new GposContextPosSubtable(rules) : undefined;
  }

  /** Reads a chaining context positioning subtable (lookup type 8). */
  static readChaining(data: DataView): GposContextPosSubtable | undefined {
    const rules = readChainingContextRules(data);
    return rules.length > 0 ? new GposContextPosSubtable(rules) : undefined;
  }

  private constructor(rules: ContextRule[]) {
    this.rules = rules;
  }

  applyToGlyphRun(glyphRun: GlyphRun, context: GposContext = {}): void {
    for (let i = 0; i < glyphRun.glyphs.length;) {
      i = this.applyAtIndex(glyphRun, i, context) ?? i + 1;
    }
  }

  /**
   * Tries to match a rule at the given glyph position and applies the
   * referenced lookups. Returns the position after the matched input
   * sequence, where processing continues, or undefined if no rule matched.
   */
  applyAtIndex(glyphRun: GlyphRun, index: number, context: GposContext = {}): number | undefined {
    const { skip, applyLookup } = context;
    if (!applyLookup) return undefined;

    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return undefined;

    // Try each rule in order — first match wins at this position
    for (const rule of this.rules) {
      const inputIndices = rule.matchInputAt(glyphRun, index, skip);
      if (!inputIndices) continue;

      // Positioning does not change the number of glyphs, so the indices
      // remain valid across lookups
      for (const record of rule.lookupRecords) {
        const targetIndex = inputIndices[record.glyphSequenceIndex];
        if (targetIndex !== undefined) {
          applyLookup(record.lookupListIndex, glyphRun, targetIndex);
        }
      }
      return inputIndices[inputIndices.length - 1] + 1;
    }

    return undefined;
  }
}

// === ANCHORS AND MARK ARRAYS ===

/**
 * Positions a mark glyph so that its anchor aligns with the anchor of the
 * glyph it attaches to. It replaces previous attachments, e.g. when a
 * `mkmk` lookup re-attaches a mark that a `mark` lookup attached to the
 * base glyph.
 *
 * The horizontal offset is relative to the origin of the target glyph and
 * is resolved after all lookups have been applied. The vertical offset
 * includes the target's current offset, so that later vertical adjustments
 * of the target do not move the mark. This matches other shaping engines.
 */
function attachMark(
  markGlyph: ShapedGlyph,
  markAnchor: AnchorPoint,
  target: ShapedGlyph,
  targetAnchor: AnchorPoint,
): void {
  markGlyph.xOffset = targetAnchor.x - markAnchor.x;
  markGlyph.yOffset = targetAnchor.y - markAnchor.y + (target.yOffset ?? 0);
}

type AnchorPoint = {
  readonly x: number;
  readonly y: number;
};

type MarkRecord = {
  readonly markClass: number;
  /** The mark's anchor, null if the mark cannot be attached. */
  readonly anchor: AnchorPoint | null;
};

function readAnchor(data: DataView): AnchorPoint {
  const reader = new DataReader(data);
  const format = reader.readUint16();
  if (format < 1 || format > 3) {
    throw new Error(`Unsupported anchor format ${format}`);
  }
  const x = reader.readInt16();
  const y = reader.readInt16();
  // Formats 2 and 3 add extra fields (contour point / device tables)
  // that we ignore — we only need design-unit coordinates.
  return { x, y };
}

function readMarkArray(data: DataView): MarkRecord[] {
  const reader = new DataReader(data);
  const markCount = reader.readUint16();
  return Array.from({ length: markCount }, () => {
    const markClass = reader.readUint16();
    const anchorOffset = reader.readUint16();
    // Some fonts contain NULL anchor offsets, although the spec requires one
    const anchor = anchorOffset ? readAnchor(subDataView(data, anchorOffset)) : null;
    return { markClass, anchor };
  });
}

function readLigatureArray(data: DataView, markClassCount: number): (AnchorPoint | null)[][][] {
  const reader = new DataReader(data);
  const ligatureCount = reader.readUint16();
  const ligatureAttachOffsets = Array.from({ length: ligatureCount }, () => reader.readUint16());
  // A LigatureAttach table has the same layout as the BaseArray, with
  // one record per ligature component
  return ligatureAttachOffsets.map((offset) => readBaseArray(subDataView(data, offset), markClassCount));
}

function readBaseArray(data: DataView, markClassCount: number): (AnchorPoint | null)[][] {
  const reader = new DataReader(data);
  const baseCount = reader.readUint16();
  return Array.from({ length: baseCount }, () => {
    const anchorOffsets = Array.from({ length: markClassCount }, () => reader.readUint16());
    return anchorOffsets.map((offset) => (offset ? readAnchor(subDataView(data, offset)) : null));
  });
}

// === SHARED HELPERS ===

/**
 * Finds the next glyph after position `index` that is not skipped.
 * When no skip function is provided, returns the immediately next glyph.
 */
function findNextGlyph(
  glyphRun: GlyphRun,
  index: number,
  skip?: (glyphId: number) => boolean,
): ShapedGlyph | undefined {
  for (let j = index + 1; j < glyphRun.glyphs.length; j++) {
    if (!skip?.(glyphRun.glyphs[j].glyphId)) {
      return glyphRun.glyphs[j];
    }
  }
  return undefined;
}

/**
 * Finds the previous glyph before position `index` that is not skipped.
 * When no skip function is provided, returns the immediately previous glyph.
 */
function findPreviousUnskipped(
  glyphRun: GlyphRun,
  index: number,
  skip?: (glyphId: number) => boolean,
): { glyph: ShapedGlyph; index: number } | undefined {
  for (let j = index - 1; j >= 0; j--) {
    if (!skip?.(glyphRun.glyphs[j].glyphId)) {
      return { glyph: glyphRun.glyphs[j], index: j };
    }
  }
  return undefined;
}
