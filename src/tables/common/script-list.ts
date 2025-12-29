import { DataReader, subDataView } from '../../data-reader.ts';

export type LangSysTable = {
  /**
   * Index of a feature required for this language system; if no
   * required features, set to 0xFFFF.
   */
  readonly requiredFeatureIndex: number;
  /** Array of indices into the FeatureList, in arbitrary order. */
  readonly featureIndices: ReadonlyArray<number>;
};

export type LangSysRecord = {
  /** 4-byte LangSys tag identifier */
  readonly langSysTag: string;
  readLangSysTable: () => LangSysTable;
};

export type ScriptTable = {
  /** Array of LangSysRecords, sorted alphabetically by LangSys tag. */
  readonly langSysRecords: ReadonlyArray<LangSysRecord>;
  /** Default LangSysTable */
  readonly defaultLangSysTable: LangSysTable | undefined;
};

export type ScriptRecord = {
  /** 4-byte script tag identifier.*/
  readonly scriptTag: string;
  readScriptTable: () => ScriptTable;
};

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
  readonly scriptRecords: ReadonlyArray<ScriptRecord>;

  /**
   * Reads a ScriptListTable from the given DataView.
   */
  static read(data: DataView): ScriptListTable {
    return new ScriptListTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const scriptCount = reader.readUint16();
    this.scriptRecords = Array.from({ length: scriptCount }, () => {
      const scriptTag = reader.readAscii(4);
      const scriptOffset = reader.readUint16();
      return {
        scriptTag,
        readScriptTable: () => readScriptTable(subDataView(data, scriptOffset)),
      };
    });
  }
}

function readScriptTable(data: DataView): ScriptTable {
  const reader = new DataReader(data);

  /** Offset to default LangSys table, from beginning of Script table — may be NULL. */
  const defaultLangSysOffset = reader.readUint16();
  const langSysCount = reader.readUint16();
  const langSysRecords = Array.from({ length: langSysCount }, () => {
    const langSysTag = reader.readAscii(4);
    const langSysOffset = reader.readUint16();
    return {
      langSysTag,
      readLangSysTable: () => readLangSysTable(subDataView(data, langSysOffset)),
    };
  });
  const defaultLangSysTable =
    defaultLangSysOffset !== 0 ? readLangSysTable(subDataView(data, defaultLangSysOffset)) : undefined;

  return {
    langSysRecords,
    defaultLangSysTable,
  };
}

function readLangSysTable(data: DataView): LangSysTable {
  const reader = new DataReader(data);

  reader.readUint16(); // lookupOrderOffset (reserved for future use)
  const requiredFeatureIndex = reader.readUint16();
  const featureIndexCount = reader.readUint16();
  const featureIndices = Array.from({ length: featureIndexCount }, () => reader.readUint16());

  return {
    requiredFeatureIndex,
    featureIndices,
  };
}
