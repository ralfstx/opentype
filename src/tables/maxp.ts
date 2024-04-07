import assert from 'node:assert';

import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';

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
