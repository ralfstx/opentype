import { DataReader, subDataView } from 'src/data-reader.ts';

/**
 * The FeatureList table enumerate all features in a font.
 * Used by GSUB and GPOS tables.
 *
 * See https://learn.microsoft.com/en-us/typography/opentype/spec/chapter2#featurelist-table
 */
export class FeatureListTable {
  /** Array of FeatureRecords. */
  readonly featureRecords: FeatureRecord[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    const featureCount = reader.readUint16();
    this.featureRecords = Array.from({ length: featureCount }, () => {
      const featureTag = reader.readAscii(4);
      const featureOffset = reader.readUint16();
      return {
        featureTag,
        featureTable: new FeatureTable(subDataView(data, featureOffset)),
      };
    });
  }
}

type FeatureRecord = {
  /** 4-byte feature identification tag. */
  featureTag: string;
  featureTable: FeatureTable;
};

export class FeatureTable {
  /** Offset from start of Feature table to feature parameters table, if defined for the feature and present, else NULL. */
  readonly featureParamsOffset: number;
  /** Array of indices into the LookupList — zero-based. */
  readonly lookupListIndices: number[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    this.featureParamsOffset = reader.readUint16();
    const lookupIndexCount = reader.readUint16();
    this.lookupListIndices = Array.from({ length: lookupIndexCount }, () => reader.readUint16());
  }
}
