import { DataReader, subDataView } from '../data-reader.ts';
import { type GlyphRun, type ShapedGlyph } from '../glyph-run.ts';
import { ClassDefTable } from './common/classdef.ts';
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
}

export type GposSubtable = GposSinglePosSubtable | GposPairPosSubtable | GposMarkBasePosSubtable;

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
  applyToGlyphRun(glyphRun: GlyphRun, skip?: (glyphId: number) => boolean): void {
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, skip);
    }
  }

  /**
   * Tries to apply the subtable to the glyph at the given position.
   * Returns true if the glyph was adjusted.
   */
  applyAtIndex(glyphRun: GlyphRun, index: number, skip?: (glyphId: number) => boolean): boolean {
    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return false;

    const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
    if (coverageIndex === -1) return false;

    // For format 1, there is only one value record, so we ignore the coverage index
    const valueRecord = this.isFormat1 ? this.valueRecords[0] : this.valueRecords[coverageIndex];
    if (!valueRecord) {
      throw new Error(`Value record not found for coverage index ${coverageIndex}`);
    }
    applyValueRecord(glyph, valueRecord);
    return true;
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

  applyToGlyphRun(glyphRun: GlyphRun, skip?: (glyphId: number) => boolean): void {
    for (let i = 0; i < glyphRun.glyphs.length - 1; i++) {
      this.applyAtIndex(glyphRun, i, skip);
    }
  }

  /**
   * Tries to apply the subtable to the pair starting at the given position.
   * Returns true if a pair matched.
   */
  applyAtIndex(glyphRun: GlyphRun, index: number, skip?: (glyphId: number) => boolean): boolean {
    const firstGlyph = glyphRun.glyphs[index];
    if (!firstGlyph || skip?.(firstGlyph.glyphId)) return false;

    const coverageIndex = this.coverageTable.lookupGlyphId(firstGlyph.glyphId);
    if (coverageIndex === -1) return false;

    // Find next non-skipped glyph as second glyph
    const secondGlyph = findNextGlyph(glyphRun, index, skip);
    if (!secondGlyph) return false;

    if (this.pairSets) {
      const pair = this.pairSets[coverageIndex]?.pairs.find((p) => p.secondGlyph === secondGlyph.glyphId);
      if (!pair) return false;

      applyValueRecord(firstGlyph, pair.valueRecord1);
      applyValueRecord(secondGlyph, pair.valueRecord2);
      return true;
    }

    if (this.classDef1 && this.classDef2 && this.class1Records) {
      const class1 = this.classDef1.lookup(firstGlyph.glyphId);
      if (class1 === undefined) return false;

      const class2 = this.classDef2.lookup(secondGlyph.glyphId);
      if (class2 === undefined) return false;

      const class2Record = this.class1Records[class1]?.[class2];
      if (!class2Record) return false;

      applyValueRecord(firstGlyph, class2Record.valueRecord1);
      applyValueRecord(secondGlyph, class2Record.valueRecord2);
      return true;
    }

    return false;
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

  applyToGlyphRun(
    glyphRun: GlyphRun,
    skip?: (glyphId: number) => boolean,
    markAttachments?: Map<number, number>,
  ): void {
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, skip, markAttachments);
    }
  }

  /**
   * Tries to attach the mark glyph at the given position to the preceding
   * base glyph. Returns true if the mark was attached.
   */
  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    skip?: (glyphId: number) => boolean,
    markAttachments?: Map<number, number>,
  ): boolean {
    const markGlyph = glyphRun.glyphs[index];
    if (!markGlyph || skip?.(markGlyph.glyphId)) return false;

    const markIndex = this.markCoverage.lookupGlyphId(markGlyph.glyphId);
    if (markIndex === -1) return false;

    const markRecord = this.markArray[markIndex];
    if (!markRecord) return false;

    // Look backward for the preceding non-skipped glyph
    const base = findPreviousUnskipped(glyphRun, index, skip);
    if (!base) return false;

    const baseIndex = this.baseCoverage.lookupGlyphId(base.glyph.glyphId);
    if (baseIndex === -1) return false;

    const baseAnchor = this.baseArray[baseIndex]?.[markRecord.markClass];
    if (!baseAnchor) return false;

    markGlyph.xOffset = (markGlyph.xOffset ?? 0) + baseAnchor.x - markRecord.anchor.x;
    markGlyph.yOffset = (markGlyph.yOffset ?? 0) + baseAnchor.y - markRecord.anchor.y;
    markAttachments?.set(index, base.index);
    return true;
  }
}

// === ANCHORS AND MARK ARRAYS ===

type AnchorPoint = {
  readonly x: number;
  readonly y: number;
};

type MarkRecord = {
  readonly markClass: number;
  readonly anchor: AnchorPoint;
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
    const anchor = readAnchor(subDataView(data, anchorOffset));
    return { markClass, anchor };
  });
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
