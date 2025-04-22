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

  findFeatureTable(featureTag: string): FeatureTable | undefined {
    const featureRecord = this.featureListTable.featureRecords.find(
      (record) => record.featureTag === featureTag,
    );
    return featureRecord?.featureTable;
  }

  readLookupSubTable(lookupIndex: number) {
    const lookupTable = this.lookupListTable.readLookupTable(lookupIndex);
    if (lookupTable.lookupType === 4) {
      return new LigatureSubtable(lookupTable.getSubTableData(0));
    }
  }
}

export class LigatureSubtable {
  #data: DataView;
  coverageTable: CoverageTable;
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
  }

  get ligatureSets() {
    return Array.from({ length: this.#ligatureSetCount }, (_, index) =>
      this.readLigatureSet(index),
    );
  }

  readLigatureSet(index: number) {
    return new LigatureSetTable(subDataView(this.#data, this.#ligatureSetOffsets[index]));
  }
}

export class LigatureSetTable {
  #data: DataView;
  ligatureCount: number;
  ligatureOffsets: number[];

  constructor(data: DataView) {
    this.#data = data;
    const reader = new DataReader(data);

    this.ligatureCount = reader.readUint16();
    this.ligatureOffsets = Array.from({ length: this.ligatureCount }, () => reader.readUint16());
  }

  get ligatures() {
    return Array.from({ length: this.ligatureCount }, (_, index) => this.readLigatureTable(index));
  }

  readLigatureTable(index: number) {
    return new LigatureTable(subDataView(this.#data, this.ligatureOffsets[index]));
  }
}

export class LigatureTable {
  ligGlyph: number;
  compCount: number;
  compGlyphIDs: number[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    this.ligGlyph = reader.readUint16();
    this.compCount = reader.readUint16();
    this.compGlyphIDs = Array.from({ length: this.compCount - 1 }, () => reader.readUint16());
  }
}
