import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

import { MaxpTable, MaxpTable05, MaxpTable10 } from './maxp.ts';

export abstract class MaxpTableBuilder extends TableBuilder {
  abstract version: 0.5 | 1;

  static forCFF() {
    return new MaxpTableBuilder05();
  }

  static forTTF() {
    return new MaxpTableBuilder10();
  }

  static forTable(table: MaxpTable) {
    if (table instanceof MaxpTable05) {
      const builder = new MaxpTableBuilder05();
      builder.numGlyphs = table.numGlyphs;
    } else if (table instanceof MaxpTable10) {
      const builder = new MaxpTableBuilder10();
      builder.numGlyphs = table.numGlyphs;
      builder.maxPoints = table.maxPoints;
      builder.maxContours = table.maxContours;
      builder.maxCompositePoints = table.maxCompositePoints;
      builder.maxCompositeContours = table.maxCompositeContours;
      builder.maxZones = table.maxZones;
      builder.maxTwilightPoints = table.maxTwilightPoints;
      builder.maxStorage = table.maxStorage;
      builder.maxFunctionDefs = table.maxFunctionDefs;
      builder.maxInstructionDefs = table.maxInstructionDefs;
      builder.maxStackElements = table.maxStackElements;
      builder.maxSizeOfInstructions = table.maxSizeOfInstructions;
      builder.maxComponentElements = table.maxComponentElements;
      builder.maxComponentDepth = table.maxComponentDepth;
    }
  }

  constructor() {
    super('maxp');
  }
}

export class MaxpTableBuilder05 extends MaxpTableBuilder {
  readonly version: 0.5 | 1;
  numGlyphs: number = 0;

  constructor() {
    super();
    this.version = 0.5;
  }

  writeTable(writer: DataWriter): void {
    writer.writeUint32(0x00005000);
    writer.writeUint16(this.numGlyphs);
  }
}

export class MaxpTableBuilder10 extends MaxpTableBuilder05 {
  readonly version: 0.5 | 1;
  maxPoints = 0;
  maxContours = 0;
  maxCompositePoints = 0;
  maxCompositeContours = 0;
  maxZones = 0;
  maxTwilightPoints = 0;
  maxStorage = 0;
  maxFunctionDefs = 0;
  maxInstructionDefs = 0;
  maxStackElements = 0;
  maxSizeOfInstructions = 0;
  maxComponentElements = 0;
  maxComponentDepth = 0;

  constructor() {
    super();
    this.version = 1.0;
  }

  writeTable(writer: DataWriter): void {
    writer.writeUint32(0x00010000);
    writer.writeUint16(this.numGlyphs);
    writer.writeUint16(this.maxPoints);
    writer.writeUint16(this.maxContours);
    writer.writeUint16(this.maxCompositePoints);
    writer.writeUint16(this.maxCompositeContours);
    writer.writeUint16(this.maxZones);
    writer.writeUint16(this.maxTwilightPoints);
    writer.writeUint16(this.maxStorage);
    writer.writeUint16(this.maxFunctionDefs);
    writer.writeUint16(this.maxInstructionDefs);
    writer.writeUint16(this.maxStackElements);
    writer.writeUint16(this.maxSizeOfInstructions);
    writer.writeUint16(this.maxComponentElements);
    writer.writeUint16(this.maxComponentDepth);
  }
}
