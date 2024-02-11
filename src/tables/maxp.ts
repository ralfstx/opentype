import assert from 'node:assert';

import { DataReader } from 'src/data-reader.ts';

/**
 * CFF fonts must use version 0.5 (only numGlyphs). TrueType fonts must
 * use version 1.0. All fields are required for version 1.0.
 */
export abstract class MaxpTable {
  abstract version: 0.5 | 1.0;
  abstract numGlyphs: number;

  static read(data: DataView): MaxpTable {
    const reader = new DataReader(data);
    const version = reader.readUint32();
    // 0x00005000 for version 0.5, 0x00010000 for version 1.0
    if (version === 0x00005000) {
      return MaxpTable05._read(reader);
    }
    if (version === 0x00010000) {
      return MaxpTable10._read(reader);
    }
    assert.fail('Invalid maxp table version');
  }
}

export class MaxpTable05 extends MaxpTable {
  version = 0.5 as const;
  numGlyphs: number;

  static _read(reader: DataReader) {
    return new MaxpTable05(reader);
  }

  private constructor(reader: DataReader) {
    super();
    this.numGlyphs = reader.readUint16();
  }
}

export class MaxpTable10 extends MaxpTable {
  version = 1.0 as const;
  numGlyphs: number;
  maxPoints: number;
  maxContours: number;
  maxCompositePoints: number;
  maxCompositeContours: number;
  maxZones: number;
  maxTwilightPoints: number;
  maxStorage: number;
  maxFunctionDefs: number;
  maxInstructionDefs: number;
  maxStackElements: number;
  maxSizeOfInstructions: number;
  maxComponentElements: number;
  maxComponentDepth: number;

  static _read(reader: DataReader) {
    return new MaxpTable10(reader);
  }

  private constructor(reader: DataReader) {
    super();
    this.numGlyphs = reader.readUint16();
    this.maxPoints = reader.readUint16();
    this.maxContours = reader.readUint16();
    this.maxCompositePoints = reader.readUint16();
    this.maxCompositeContours = reader.readUint16();
    this.maxZones = reader.readUint16();
    this.maxTwilightPoints = reader.readUint16();
    this.maxStorage = reader.readUint16();
    this.maxFunctionDefs = reader.readUint16();
    this.maxInstructionDefs = reader.readUint16();
    this.maxStackElements = reader.readUint16();
    this.maxSizeOfInstructions = reader.readUint16();
    this.maxComponentElements = reader.readUint16();
    this.maxComponentDepth = reader.readUint16();
  }
}
