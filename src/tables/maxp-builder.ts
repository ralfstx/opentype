import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

import { MaxpTable } from './maxp.ts';

export class MaxpTableBuilder extends TableBuilder {
  version?: 0.5 | 1;
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

  constructor(init?: MaxpTable) {
    super('maxp');
    this.version = init?.version;
    this.numGlyphs = init?.numGlyphs ?? 0;
    this.maxPoints = init?.maxPoints;
    this.maxContours = init?.maxContours;
    this.maxCompositePoints = init?.maxCompositePoints;
    this.maxCompositeContours = init?.maxCompositeContours;
    this.maxZones = init?.maxZones;
    this.maxTwilightPoints = init?.maxTwilightPoints;
    this.maxStorage = init?.maxStorage;
    this.maxFunctionDefs = init?.maxFunctionDefs;
    this.maxInstructionDefs = init?.maxInstructionDefs;
    this.maxStackElements = init?.maxStackElements;
    this.maxSizeOfInstructions = init?.maxSizeOfInstructions;
    this.maxComponentElements = init?.maxComponentElements;
    this.maxComponentDepth = init?.maxComponentDepth;
  }

  #hasExtraProperties() {
    return (
      this.maxPoints != null ||
      this.maxContours != null ||
      this.maxCompositePoints != null ||
      this.maxCompositeContours != null ||
      this.maxZones != null ||
      this.maxTwilightPoints != null ||
      this.maxStorage != null ||
      this.maxFunctionDefs != null ||
      this.maxInstructionDefs != null ||
      this.maxStackElements != null ||
      this.maxSizeOfInstructions != null ||
      this.maxComponentElements != null ||
      this.maxComponentDepth != null
    );
  }

  writeTable(writer: DataWriter): void {
    const hasExtraProperties = this.#hasExtraProperties();
    const version = this.version ?? (hasExtraProperties ? 1 : 0.5);
    if (hasExtraProperties && version !== 1) {
      throw new Error('Extra properties require version 1.0');
    }
    writer.writeUint32(version === 1 ? 0x00010000 : 0x00005000);
    writer.writeUint16(this.numGlyphs);
    if (version === 1) {
      writer.writeUint16(this.maxPoints ?? 0);
      writer.writeUint16(this.maxContours ?? 0);
      writer.writeUint16(this.maxCompositePoints ?? 0);
      writer.writeUint16(this.maxCompositeContours ?? 0);
      writer.writeUint16(this.maxZones ?? 0);
      writer.writeUint16(this.maxTwilightPoints ?? 0);
      writer.writeUint16(this.maxStorage ?? 0);
      writer.writeUint16(this.maxFunctionDefs ?? 0);
      writer.writeUint16(this.maxInstructionDefs ?? 0);
      writer.writeUint16(this.maxStackElements ?? 0);
      writer.writeUint16(this.maxSizeOfInstructions ?? 0);
      writer.writeUint16(this.maxComponentElements ?? 0);
      writer.writeUint16(this.maxComponentDepth ?? 0);
    }
  }
}
