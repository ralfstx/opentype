import assert from 'node:assert';

import { DataReader } from 'src/data-reader.ts';

export class MaxpTable {
  version: 0.5 | 1.0;
  numGlyphs: number;
  maxPoints?: number;
  maxContours?: number;
  maxCompositePoints?: number;
  maxCompositeContours?: number;
  maxZones?: number;
  maxTwilightPoints?: number;
  maxStorage?: number;
  maxFunctionDefs?: number;
  maxInstructionDefs?: number;
  maxStackElements?: number;
  maxSizeOfInstructions?: number;
  maxComponentElements?: number;
  maxComponentDepth?: number;

  constructor(data: DataView) {
    const reader = new DataReader(data);
    const version = reader.readUint32();
    // 0x00005000 for version 0.5, 0x00010000 for version 1.0
    assert.ok(version === 0x00005000 || version === 0x00010000, 'Invalid maxp table version');
    this.version = version === 0x00010000 ? 1.0 : 0.5;
    this.numGlyphs = reader.readUint16();

    if (version === 0x00010000) {
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
}
