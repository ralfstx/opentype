import { DataReader, subDataView } from '../../data-reader.ts';

/**
 * A Feature table defines a set of lookups that implement a feature.
 */
export type FeatureTable = {
  /**
   * Offset from start of Feature table to feature parameters table, if
   * defined for the feature and present, else NULL.
   */
  readonly featureParamsOffset: number;
  /** Array of indices into the LookupList — zero-based. */
  readonly lookupListIndices: ReadonlyArray<number>;
};

/**
 * A FeatureRecord associates a feature tag with a Feature table.
 */
export type FeatureRecord = {
  /** 4-byte feature identification tag. */
  readonly featureTag: string;
  /** Reads the feature table for this feature. */
  readFeatureTable: () => FeatureTable;
};

/**
 * The FeatureList table enumerate all features in a font.
 * Used by GSUB and GPOS tables.
 *
 * See https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#featurelist-table
 */
export class FeatureListTable {
  /**
   * The FeatureRecords in this FeatureListTable.
   */
  readonly featureRecords: ReadonlyArray<FeatureRecord>;

  /**
   * Reads a FeatureListTable from the given DataView.
   */
  static read(data: DataView): FeatureListTable {
    return new FeatureListTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const featureCount = reader.readUint16();
    this.featureRecords = Array.from({ length: featureCount }, () => {
      const featureTag = reader.readAscii(4);
      const featureOffset = reader.readUint16();
      return {
        featureTag,
        readFeatureTable: () => readFeatureTable(subDataView(data, featureOffset)),
      };
    });
  }
}

function readFeatureTable(data: DataView): FeatureTable {
  const reader = new DataReader(data);

  const featureParamsOffset = reader.readUint16();
  const lookupIndexCount = reader.readUint16();
  const lookupListIndices = Array.from({ length: lookupIndexCount }, () => reader.readUint16());

  return {
    featureParamsOffset,
    lookupListIndices,
  };
}
