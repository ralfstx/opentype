import { DataReader } from 'src/data-reader.ts';

export class PostTable {
  version: number;
  italicAngle: number;
  underlinePosition: number;
  underlineThickness: number;
  isFixedPitch: number;
  minMemType42: number;
  maxMemType42: number;
  minMemType1: number;
  maxMemType1: number;

  static read(data: DataView): PostTable {
    return new PostTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    this.version = reader.readFixed();
    this.italicAngle = reader.readFixed();
    this.underlinePosition = reader.readInt16();
    this.underlineThickness = reader.readInt16();
    this.isFixedPitch = reader.readUint32();
    this.minMemType42 = reader.readUint32();
    this.maxMemType42 = reader.readUint32();
    this.minMemType1 = reader.readUint32();
    this.maxMemType1 = reader.readUint32();
  }
}
