import assert from 'node:assert';

import { DataReader, subDataView } from 'src/data-reader.ts';
import { CoverageTable } from 'src/tables/coverage.ts';

export class GsubTable {
  readonly data: DataView;
  readonly scriptCount: number;
  readonly script_records: ScriptRecord[];
  readonly featureListTable: FeatureListTable;
  readonly lookupListTable: LookupListTable;

  static read(data: DataView) {
    return new GsubTable(data);
  }

  private constructor(data: DataView) {
    this.data = data;
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

    this.scriptCount = reader.readUint16();
    this.script_records = Array.from({ length: this.scriptCount }, () => {
      const scriptTag = reader.readTag();
      const scriptOffset = reader.readUint16();
      const subData = subDataView(this.data, scriptListOffset + scriptOffset);
      return new ScriptRecord(this, subData, scriptTag);
    });

    this.featureListTable = new FeatureListTable(subDataView(this.data, featureListOffset));
    this.lookupListTable = new LookupListTable(subDataView(this.data, lookupListOffset));
  }
}

class ScriptRecord {
  gsub: GsubTable;
  data: DataView;
  scriptTag: string;
  reader: DataReader;
  langSysCount: number;
  defaultLangSys: number;
  langSysRecords: LangSysRecord[];

  constructor(gsub: GsubTable, data: DataView, scriptTag: string) {
    this.gsub = gsub;
    this.data = data;
    this.scriptTag = scriptTag;
    this.reader = new DataReader(data);
    this.defaultLangSys = this.reader.readUint16();
    this.langSysCount = this.reader.readUint16();
    this.langSysRecords = Array.from({ length: this.langSysCount }, () =>
      this.#readLangSysRecord(this.reader),
    );
  }

  #readLangSysRecord(reader: DataReader): LangSysRecord {
    const langSysTag = reader.readTag();
    const langSysOffset = reader.readUint16();
    return { langSysTag, langSysOffset };
  }

  readLangSysTable(langSys: LangSysRecord): LangSysTable {
    return new LangSysTable(subDataView(this.data, langSys.langSysOffset));
  }
}

type LangSysRecord = {
  langSysTag: string;
  langSysOffset: number;
};

class LangSysTable {
  data: DataView;
  reader: DataReader;
  requiredFeatureIndex: number;
  featureIndexCount: number;
  featureIndices: number[];

  constructor(data: DataView) {
    this.data = data;
    this.reader = new DataReader(data);

    this.reader.readUint16(); // lookupOrderOffset (reserved for future use)
    this.requiredFeatureIndex = this.reader.readUint16();
    this.featureIndexCount = this.reader.readUint16();
    this.featureIndices = Array.from({ length: this.featureIndexCount }, () =>
      this.reader.readUint16(),
    );
  }
}

type FeatureRecord = {
  featureTag: string;
  featureOffset: number;
};

class FeatureListTable {
  data: DataView;
  featureRecords: FeatureRecord[];

  constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    const featureCount = reader.readUint16();
    this.featureRecords = Array.from({ length: featureCount }, () =>
      this.#readFeatureRecord(reader),
    );
  }

  #readFeatureRecord(reader: DataReader): FeatureRecord {
    const featureTag = reader.readTag();
    const featureOffset = reader.readUint16();
    return { featureTag, featureOffset };
  }

  readFeatureTable(offset: number) {
    const reader = new DataReader(subDataView(this.data, offset));
    const featureParamsOffset = reader.readUint16();
    const lookupIndexCount = reader.readUint16();
    const lookupListIndices = Array.from({ length: lookupIndexCount }, () => reader.readUint16());
    return { featureParamsOffset, lookupIndexCount, lookupListIndices };
  }
}

class LookupListTable {
  data: DataView;
  #lookupCount: number;
  #lookupOffsets: number[];

  constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    this.#lookupCount = reader.readUint16();
    this.#lookupOffsets = Array.from({ length: this.#lookupCount }, () => reader.readUint16());
  }

  get lookups() {
    return Array.from({ length: this.#lookupCount }, (_, index) => this.#readLookupTable(index));
  }

  #readLookupTable(index: number) {
    return new LookupTable(subDataView(this.data, this.#lookupOffsets[index]));
  }
}

class LookupTable {
  data: DataView;
  lookupType: number;
  lookupFlag: number;
  #subTableCount: number;
  #subTableOffsets: number[];
  markFilteringSet: number;

  constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    this.lookupType = reader.readUint16();
    this.lookupFlag = reader.readUint16();
    this.#subTableCount = reader.readUint16();
    this.#subTableOffsets = Array.from({ length: this.#subTableCount }, () => reader.readUint16());
    this.markFilteringSet = reader.readUint16();
  }

  get subTables() {
    return Array.from({ length: this.#subTableCount }, (_, index) => this.#readSubTable(index));
  }

  #readSubTable(index: number) {
    if (this.lookupType === 4) {
      return new LigatureSubtable(subDataView(this.data, this.#subTableOffsets[index]));
    }
    throw new Error(`Unsupported lookup type ${this.lookupType}`);
  }
}

class LigatureSubtable {
  data: DataView;
  coverage: CoverageTable;
  #ligatureSetCount: number;
  #ligatureSetOffsets: number[];

  constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    assert.equal(reader.readUint16(), 1); // ligatureSubstFormat
    const coverageOffset = reader.readUint16();
    this.#ligatureSetCount = reader.readUint16();
    this.#ligatureSetOffsets = Array.from({ length: this.#ligatureSetCount }, () =>
      reader.readUint16(),
    );

    this.coverage = CoverageTable.read(subDataView(this.data, coverageOffset));
  }

  get ligatureSets() {
    return Array.from({ length: this.#ligatureSetCount }, (_, index) =>
      this.readLigatureSet(index),
    );
  }

  readLigatureSet(index: number) {
    return new LigatureSetTable(subDataView(this.data, this.#ligatureSetOffsets[index]));
  }
}

class LigatureSetTable {
  data: DataView;
  ligatureCount: number;
  ligatureOffsets: number[];

  constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    this.ligatureCount = reader.readUint16();
    this.ligatureOffsets = Array.from({ length: this.ligatureCount }, () => reader.readUint16());
  }

  get ligatures() {
    return Array.from({ length: this.ligatureCount }, (_, index) => this.readLigatureTable(index));
  }

  readLigatureTable(index: number) {
    return new LigatureTable(subDataView(this.data, this.ligatureOffsets[index]));
  }
}

class LigatureTable {
  data: DataView;
  ligGlyph: number;
  compCount: number;
  compGlyphIDs: number[];

  constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    this.ligGlyph = reader.readUint16();
    this.compCount = reader.readUint16();
    this.compGlyphIDs = Array.from({ length: this.compCount - 1 }, () => reader.readUint16());
  }
}
