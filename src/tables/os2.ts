import { DataReader } from 'src/data-reader.ts';

export class Os2Table {
  version: number;
  xAvgCharWidth: number;
  usWeightClass: number;
  usWidthClass: number;
  fsType: number;
  ySubscriptXSize: number;
  ySubscriptYSize: number;
  ySubscriptXOffset: number;
  ySubscriptYOffset: number;
  ySuperscriptXSize: number;
  ySuperscriptYSize: number;
  ySuperscriptXOffset: number;
  ySuperscriptYOffset: number;
  yStrikeoutSize: number;
  yStrikeoutPosition: number;
  sFamilyClass: number;
  panose: number[];
  ulUnicodeRange1: number;
  ulUnicodeRange2: number;
  ulUnicodeRange3: number;
  ulUnicodeRange4: number;
  achVendID: string;
  fsSelection: number;
  usFirstCharIndex: number;
  usLastCharIndex: number;
  sTypoAscender?: number;
  sTypoDescender?: number;
  sTypoLineGap?: number;
  usWinAscent?: number;
  usWinDescent?: number;
  ulCodePageRange1?: number;
  ulCodePageRange2?: number;
  sxHeight?: number;
  sCapHeight?: number;
  usDefaultChar?: number;
  usBreakChar?: number;
  usMaxContext?: number;
  usLowerOpticalPointSize?: number;
  usUpperOpticalPointSize?: number;

  static read(data: DataView): Os2Table {
    return new Os2Table(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);
    this.version = reader.readUint16();
    this.xAvgCharWidth = reader.readInt16();
    this.usWeightClass = reader.readUint16();
    this.usWidthClass = reader.readUint16();
    this.fsType = reader.readUint16();
    this.ySubscriptXSize = reader.readInt16();
    this.ySubscriptYSize = reader.readInt16();
    this.ySubscriptXOffset = reader.readInt16();
    this.ySubscriptYOffset = reader.readInt16();
    this.ySuperscriptXSize = reader.readInt16();
    this.ySuperscriptYSize = reader.readInt16();
    this.ySuperscriptXOffset = reader.readInt16();
    this.ySuperscriptYOffset = reader.readInt16();
    this.yStrikeoutSize = reader.readInt16();
    this.yStrikeoutPosition = reader.readInt16();
    this.sFamilyClass = reader.readInt16();
    this.panose = Array.from({ length: 10 }, () => reader.readUint8());
    this.ulUnicodeRange1 = reader.readUint32();
    this.ulUnicodeRange2 = reader.readUint32();
    this.ulUnicodeRange3 = reader.readUint32();
    this.ulUnicodeRange4 = reader.readUint32();
    this.achVendID = String.fromCharCode(...reader.readBytes(4));
    this.fsSelection = reader.readUint16();
    this.usFirstCharIndex = reader.readUint16();
    this.usLastCharIndex = reader.readUint16();

    // Documentation for OS/2 version 0 in Apple’s TrueType Reference
    // Manual stops at the usLastCharIndex field. Some legacy TrueType
    // fonts may have been built with a shortened version 0 OS/2 table.
    if (data.byteLength >= reader.position + 10) {
      this.sTypoAscender = reader.readInt16();
      this.sTypoDescender = reader.readInt16();
      this.sTypoLineGap = reader.readInt16();
      this.usWinAscent = reader.readUint16();
      this.usWinDescent = reader.readUint16();
    }

    if (this.version >= 1) {
      this.ulCodePageRange1 = reader.readUint32();
      this.ulCodePageRange2 = reader.readUint32();
    }

    if (this.version >= 2) {
      this.sxHeight = reader.readInt16();
      this.sCapHeight = reader.readInt16();
      this.usDefaultChar = reader.readUint16();
      this.usBreakChar = reader.readUint16();
      this.usMaxContext = reader.readUint16();
    }

    if (this.version >= 5) {
      this.usLowerOpticalPointSize = reader.readUint16();
      this.usUpperOpticalPointSize = reader.readUint16();
    }
  }
}
