import { DataReader, subDataView } from '../../data-reader.ts';

/**
 * The ScriptList table contains a list of script records, each of which
 * represents a specific script. Used by the GSUB and GPOS tables.
 *
 * Script tags:
 * https://learn.microsoft.com/en-us/typography/opentype/spec/scripttags
 *
 * See
 * https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#scriptlist-table
 */
export class ScriptListTable {
  /** Array of ScriptRecords, listed alphabetically by script tag */
  readonly scriptRecords: ScriptRecord[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    const scriptCount = reader.readUint16();
    this.scriptRecords = Array.from({ length: scriptCount }, () => {
      const scriptTag = reader.readAscii(4);
      const scriptOffset = reader.readUint16();
      return {
        scriptTag,
        scriptTable: new ScriptTable(subDataView(data, scriptOffset)),
      };
    });
  }
}

export type ScriptRecord = {
  /** 4-byte script tag identifier.*/
  scriptTag: string;
  scriptTable: ScriptTable;
};

export class ScriptTable {
  /** Array of LangSysRecords, sorted alphabetically by LangSys tag. */
  readonly langSysRecords: LangSysRecord[];
  /** Default LangSysTable */
  readonly defaultLangSysTable: LangSysTable | undefined;

  constructor(data: DataView) {
    const reader = new DataReader(data);

    /** Offset to default LangSys table, from beginning of Script table — may be NULL. */
    const defaultLangSysOffset = reader.readUint16();
    const langSysCount = reader.readUint16();
    this.langSysRecords = Array.from({ length: langSysCount }, () => {
      const langSysTag = reader.readAscii(4);
      const langSysOffset = reader.readUint16();
      return {
        langSysTag,
        langSysTable: new LangSysTable(subDataView(data, langSysOffset)),
      };
    });
    if (defaultLangSysOffset !== 0) {
      this.defaultLangSysTable = new LangSysTable(subDataView(data, defaultLangSysOffset));
    }
  }
}

export type LangSysRecord = {
  /** 4-byte LangSys tag identifier */
  langSysTag: string;
  langSysTable: LangSysTable;
};

export class LangSysTable {
  /** Index of a feature required for this language system; if no required features, set to 0xFFFF. */
  readonly requiredFeatureIndex: number;
  /** Array of indices into the FeatureList, in arbitrary order. */
  readonly featureIndices: number[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    reader.readUint16(); // lookupOrderOffset (reserved for future use)
    this.requiredFeatureIndex = reader.readUint16();
    const featureIndexCount = reader.readUint16();
    this.featureIndices = Array.from({ length: featureIndexCount }, () => reader.readUint16());
  }
}
