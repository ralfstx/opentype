import { DataReader, subDataView } from '../data-reader.ts';
import { type GlyphRun } from '../glyph-run.ts';
import { CoverageTable } from './common/coverage.ts';
import { FeatureListTable, type FeatureTable } from './common/feature-list.ts';
import { LookupListTable, type LookupTable } from './common/lookup-list.ts';
import { type LangSysTable, ScriptListTable } from './common/script-list.ts';

/**
 * The 'GSUB' table provides glyph substitution data for advanced typography features like ligatures.
 */
export class GsubTable {
  readonly #data: DataView;
  readonly scriptListTable: ScriptListTable;

  readonly featureListTable: FeatureListTable;
  readonly lookupListTable: LookupListTable;

  /**
   * Reads a 'GSUB' table from the given DataView.
   */
  static read(data: DataView) {
    return new GsubTable(data);
  }

  private constructor(data: DataView) {
    this.#data = data;
    const reader = new DataReader(data);

    const majorVersion = reader.readUint16();
    if (majorVersion !== 1) {
      throw new Error(`Unsupported GSUB table version ${majorVersion}`);
    }
    const minorVersion = reader.readUint16();
    if (minorVersion !== 0 && minorVersion !== 1) {
      throw new Error(`Unsupported GSUB table version ${majorVersion}.${minorVersion}`);
    }
    const scriptListOffset = reader.readUint16();
    const featureListOffset = reader.readUint16();
    const lookupListOffset = reader.readUint16();
    if (minorVersion === 1) reader.readUint32(); // featureVariationsOffset

    this.scriptListTable = new ScriptListTable(subDataView(this.#data, scriptListOffset));
    this.featureListTable = new FeatureListTable(subDataView(this.#data, featureListOffset));
    this.lookupListTable = new LookupListTable(subDataView(this.#data, lookupListOffset));
  }

  findLangSysTable(scriptTag: string, langSysTag: string): LangSysTable | undefined {
    const scriptRecord = this.scriptListTable.scriptRecords.find(
      (record) => record.scriptTag === scriptTag,
    )?.scriptTable;
    if (!scriptRecord) return undefined;
    const langSysRecord = scriptRecord.langSysRecords.find(
      (record) => record.langSysTag === langSysTag,
    );
    return langSysRecord?.langSysTable ?? scriptRecord.defaultLangSysTable;
  }

  findFeatureTables(featureTag: string): FeatureTable[] {
    const featureRecords = this.featureListTable.featureRecords.filter(
      (record) => record.featureTag === featureTag,
    );
    return featureRecords.map((rec) => rec.featureTable);
  }
}

// === SUBTABLES ===

export function readGsubSubtable(
  lookupTable: LookupTable,
  subtableIndex: number,
): GposSubtable | undefined {
  if (lookupTable.lookupType === 4) {
    return new GsubLigatureSubstSubtable(lookupTable.getSubTableData(subtableIndex));
  }
}

export type GposSubtable = GsubLigatureSubstSubtable;

export class GsubLigatureSubstSubtable {
  #data: DataView;
  coverageTable: CoverageTable;
  ligatureSets: LigatureSetTable[];
  #ligatureSetCount: number;
  #ligatureSetOffsets: number[];

  constructor(data: DataView) {
    this.#data = data;
    const reader = new DataReader(data);

    if (reader.readUint16() !== 1) {
      throw new Error('ligatureSubstFormat should be 1');
    }
    const coverageOffset = reader.readUint16();
    this.#ligatureSetCount = reader.readUint16();
    this.#ligatureSetOffsets = Array.from({ length: this.#ligatureSetCount }, () =>
      reader.readUint16(),
    );

    this.coverageTable = CoverageTable.read(subDataView(this.#data, coverageOffset));
    this.ligatureSets = Array.from({ length: this.#ligatureSetCount }, (_, index) => {
      return new LigatureSetTable(subDataView(this.#data, this.#ligatureSetOffsets[index]));
    });
  }

  /**
   * Applies the ligature substitution to the given glyph sequence.
   * For performance reasons, the glyph sequence is modified in place.
   */
  applyToGlyphRun(glyphRun: GlyphRun): void {
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      const startGlyph = glyphRun.glyphs[i];

      const coverageIndex = this.coverageTable.lookupGlyphId(startGlyph.glyphId);

      if (coverageIndex !== -1) {
        const ligatureSetTable = this.ligatureSets[coverageIndex];

        // Try to match the longest possible ligature
        for (const ligatureTable of ligatureSetTable.ligatureTables) {
          const compCount = ligatureTable.compGlyphIDs.length;
          const end = i + compCount;

          if (end >= glyphRun.glyphs.length) continue;

          const match = ligatureTable.compGlyphIDs.every(
            (gid, idx) => glyphRun.glyphs[i + 1 + idx]?.glyphId === gid,
          );

          if (match) {
            glyphRun.glyphs.splice(i, compCount + 1, { glyphId: ligatureTable.ligGlyph }); // Remove matched glyphs
            break;
          }
        }
      }
    }
  }
}

class LigatureSetTable {
  readonly ligatureTables: LigatureTable[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    const ligatureCount = reader.readUint16();
    const ligatureOffsets = Array.from({ length: ligatureCount }, () => reader.readUint16());
    this.ligatureTables = ligatureOffsets.map((offset) => {
      return new LigatureTable(subDataView(data, offset));
    });
  }
}

class LigatureTable {
  readonly ligGlyph: number;
  readonly compGlyphIDs: number[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    this.ligGlyph = reader.readUint16();
    const compCount = reader.readUint16();
    this.compGlyphIDs = Array.from({ length: compCount - 1 }, () => reader.readUint16());
  }
}
