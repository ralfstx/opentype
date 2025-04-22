import assert from 'node:assert';

import { DataReader, subDataView } from '../data-reader.ts';
import { CoverageTable } from './common/coverage.ts';
import { FeatureListTable, type FeatureTable } from './common/feature-list.ts';
import { LookupListTable } from './common/lookup-list.ts';
import { type LangSysTable, ScriptListTable } from './common/script-list.ts';

export class GsubTable {
  readonly #data: DataView;
  readonly scriptListTable: ScriptListTable;

  readonly featureListTable: FeatureListTable;
  readonly lookupListTable: LookupListTable;

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

export class LigatureSubtable {
  #data: DataView;
  coverageTable: CoverageTable;
  ligatureSets: LigatureSetTable[];
  #ligatureSetCount: number;
  #ligatureSetOffsets: number[];

  constructor(data: DataView) {
    this.#data = data;
    const reader = new DataReader(data);

    assert.equal(reader.readUint16(), 1); // ligatureSubstFormat
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

  applyToGlyphSequence(glyphSequence: number[]): number[] {
    const result: number[] = [];
    let i = 0;

    while (i < glyphSequence.length) {
      const startGlyph = glyphSequence[i];
      const coverageIndex = this.coverageTable.lookupGlyphId(startGlyph);

      if (coverageIndex === -1) {
        // Not covered, copy as-is
        result.push(startGlyph);
        i++;
        continue;
      }

      const ligatureSetTable = this.ligatureSets[coverageIndex];
      let matched = false;

      // Try to match the longest possible ligature
      for (const ligatureTable of ligatureSetTable.ligatureTables) {
        const compCount = ligatureTable.compGlyphIDs.length;
        const end = i + compCount;

        if (end >= glyphSequence.length) continue;

        const match = ligatureTable.compGlyphIDs.every(
          (gid, idx) => glyphSequence[i + 1 + idx] === gid,
        );

        if (match) {
          result.push(ligatureTable.ligGlyph);
          i += compCount + 1; // Skip over matched glyphs
          matched = true;
          break;
        }
      }

      if (!matched) {
        result.push(startGlyph);
        i++;
      }
    }

    return result;
  }
}

export class LigatureSetTable {
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

export class LigatureTable {
  readonly ligGlyph: number;
  readonly compGlyphIDs: number[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    this.ligGlyph = reader.readUint16();
    const compCount = reader.readUint16();
    this.compGlyphIDs = Array.from({ length: compCount - 1 }, () => reader.readUint16());
  }
}
