import { DataReader } from 'src/data-reader.ts';

export type OS2Table = {
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
};

export function readOs2Table(data: DataView): OS2Table {
  const reader = new DataReader(data);
  const version = reader.readUint16();
  const os2: OS2Table = {
    version,
    xAvgCharWidth: reader.readInt16(),
    usWeightClass: reader.readUint16(),
    usWidthClass: reader.readUint16(),
    fsType: reader.readUint16(),
    ySubscriptXSize: reader.readInt16(),
    ySubscriptYSize: reader.readInt16(),
    ySubscriptXOffset: reader.readInt16(),
    ySubscriptYOffset: reader.readInt16(),
    ySuperscriptXSize: reader.readInt16(),
    ySuperscriptYSize: reader.readInt16(),
    ySuperscriptXOffset: reader.readInt16(),
    ySuperscriptYOffset: reader.readInt16(),
    yStrikeoutSize: reader.readInt16(),
    yStrikeoutPosition: reader.readInt16(),
    sFamilyClass: reader.readInt16(),
    panose: Array.from({ length: 10 }, () => reader.readUint8()),
    ulUnicodeRange1: reader.readUint32(),
    ulUnicodeRange2: reader.readUint32(),
    ulUnicodeRange3: reader.readUint32(),
    ulUnicodeRange4: reader.readUint32(),
    achVendID: String.fromCharCode(...reader.readBytes(4)),
    fsSelection: reader.readUint16(),
    usFirstCharIndex: reader.readUint16(),
    usLastCharIndex: reader.readUint16(),
  };

  // Documentation for OS/2 version 0 in Apple’s TrueType Reference
  // Manual stops at the usLastCharIndex field. Some legacy TrueType
  // fonts may have been built with a shortened version 0 OS/2 table.
  if (data.byteLength >= reader.position + 10) {
    os2.sTypoAscender = reader.readInt16();
    os2.sTypoDescender = reader.readInt16();
    os2.sTypoLineGap = reader.readInt16();
    os2.usWinAscent = reader.readUint16();
    os2.usWinDescent = reader.readUint16();
  }

  if (os2.version >= 1) {
    os2.ulCodePageRange1 = reader.readUint32();
    os2.ulCodePageRange2 = reader.readUint32();
  }

  if (os2.version >= 2) {
    os2.sxHeight = reader.readInt16();
    os2.sCapHeight = reader.readInt16();
    os2.usDefaultChar = reader.readUint16();
    os2.usBreakChar = reader.readUint16();
    os2.usMaxContext = reader.readUint16();
  }

  if (os2.version >= 5) {
    os2.usLowerOpticalPointSize = reader.readUint16();
    os2.usUpperOpticalPointSize = reader.readUint16();
  }

  return os2;
}
