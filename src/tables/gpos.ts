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
  if (lookupTable.lookupType === 1) {
    return GposSinglePosSubtable.read(lookupTable.getSubTableData(subtableIndex));
  }
  if (lookupTable.lookupType === 2) {
    return GposPairPosSubtable.read(lookupTable.getSubTableData(subtableIndex));
  }
}

export type GposSubtable = GposSinglePosSubtable | GposPairPosSubtable;

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
    for (let i = 0, len = glyphRun.glyphs.length; i < len; i++) {
      const glyph = glyphRun.glyphs[i];
      if (skip?.(glyph.glyphId)) continue;
      const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
      if (coverageIndex !== -1) {
        // For format 1, there is only one value record, so we ignore the coverage index
        const valueRecord = this.isFormat1 ? this.valueRecords[0] : this.valueRecords[coverageIndex];
        if (!valueRecord) {
          throw new Error(`Value record not found for coverage index ${coverageIndex}`);
        }
        applyValueRecord(glyph, valueRecord);
      }
    }
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
      const firstGlyph = glyphRun.glyphs[i];
      if (skip?.(firstGlyph.glyphId)) continue;
      const coverageIndex = this.coverageTable.lookupGlyphId(firstGlyph.glyphId);
      if (coverageIndex === undefined) continue;

      // Find next non-skipped glyph as second glyph
      const secondGlyph = findNextGlyph(glyphRun, i, skip);
      if (!secondGlyph) continue;

      if (this.pairSets) {
        const pairSet = this.pairSets[coverageIndex];
        if (!pairSet) continue;

        const pair = pairSet.pairs.find((p) => p.secondGlyph === secondGlyph.glyphId);
        if (!pair) continue;

        applyValueRecord(firstGlyph, pair.valueRecord1);
        applyValueRecord(secondGlyph, pair.valueRecord2);
      } else if (this.classDef1 && this.classDef2 && this.class1Records) {
        const class1 = this.classDef1.lookup(firstGlyph.glyphId);
        if (class1 === undefined) continue;

        const class2 = this.classDef2.lookup(secondGlyph.glyphId);
        if (class2 === undefined) continue;

        const class1Record = this.class1Records[class1];
        if (!class1Record) continue;

        const class2Record = class1Record[class2];
        if (!class2Record) continue;

        applyValueRecord(firstGlyph, class2Record.valueRecord1);
        applyValueRecord(secondGlyph, class2Record.valueRecord2);
      }
    }
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
