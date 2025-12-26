import { DataReader } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { TableBuilder } from '../table-builder.ts';

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

/**
 * Builder for the OS/2 table.
 *
 * The version determines which fields are written:
 * - Version 0: Base fields only (up to usLastCharIndex, plus optional sTypoAscender..usWinDescent)
 * - Version 1: Adds ulCodePageRange1/2
 * - Version 2-4: Adds sxHeight, sCapHeight, usDefaultChar, usBreakChar, usMaxContext
 * - Version 5: Adds usLowerOpticalPointSize, usUpperOpticalPointSize
 */
export class Os2TableBuilder extends TableBuilder {
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
  sTypoAscender: number;
  sTypoDescender: number;
  sTypoLineGap: number;
  usWinAscent: number;
  usWinDescent: number;
  ulCodePageRange1: number;
  ulCodePageRange2: number;
  sxHeight: number;
  sCapHeight: number;
  usDefaultChar: number;
  usBreakChar: number;
  usMaxContext: number;
  usLowerOpticalPointSize: number;
  usUpperOpticalPointSize: number;

  constructor(init?: Os2Table) {
    super('OS/2');
    this.version = init?.version ?? 4;
    this.xAvgCharWidth = init?.xAvgCharWidth ?? 0;
    this.usWeightClass = init?.usWeightClass ?? 400;
    this.usWidthClass = init?.usWidthClass ?? 5;
    this.fsType = init?.fsType ?? 0;
    this.ySubscriptXSize = init?.ySubscriptXSize ?? 0;
    this.ySubscriptYSize = init?.ySubscriptYSize ?? 0;
    this.ySubscriptXOffset = init?.ySubscriptXOffset ?? 0;
    this.ySubscriptYOffset = init?.ySubscriptYOffset ?? 0;
    this.ySuperscriptXSize = init?.ySuperscriptXSize ?? 0;
    this.ySuperscriptYSize = init?.ySuperscriptYSize ?? 0;
    this.ySuperscriptXOffset = init?.ySuperscriptXOffset ?? 0;
    this.ySuperscriptYOffset = init?.ySuperscriptYOffset ?? 0;
    this.yStrikeoutSize = init?.yStrikeoutSize ?? 0;
    this.yStrikeoutPosition = init?.yStrikeoutPosition ?? 0;
    this.sFamilyClass = init?.sFamilyClass ?? 0;
    this.panose = init?.panose ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.ulUnicodeRange1 = init?.ulUnicodeRange1 ?? 0;
    this.ulUnicodeRange2 = init?.ulUnicodeRange2 ?? 0;
    this.ulUnicodeRange3 = init?.ulUnicodeRange3 ?? 0;
    this.ulUnicodeRange4 = init?.ulUnicodeRange4 ?? 0;
    this.achVendID = init?.achVendID ?? '    ';
    this.fsSelection = init?.fsSelection ?? 0;
    this.usFirstCharIndex = init?.usFirstCharIndex ?? 0;
    this.usLastCharIndex = init?.usLastCharIndex ?? 0xffff;
    this.sTypoAscender = init?.sTypoAscender ?? 0;
    this.sTypoDescender = init?.sTypoDescender ?? 0;
    this.sTypoLineGap = init?.sTypoLineGap ?? 0;
    this.usWinAscent = init?.usWinAscent ?? 0;
    this.usWinDescent = init?.usWinDescent ?? 0;
    this.ulCodePageRange1 = init?.ulCodePageRange1 ?? 0;
    this.ulCodePageRange2 = init?.ulCodePageRange2 ?? 0;
    this.sxHeight = init?.sxHeight ?? 0;
    this.sCapHeight = init?.sCapHeight ?? 0;
    this.usDefaultChar = init?.usDefaultChar ?? 0;
    this.usBreakChar = init?.usBreakChar ?? 0x0020;
    this.usMaxContext = init?.usMaxContext ?? 0;
    this.usLowerOpticalPointSize = init?.usLowerOpticalPointSize ?? 0;
    this.usUpperOpticalPointSize = init?.usUpperOpticalPointSize ?? 0xffff;
  }

  writeTable(writer: DataWriter): void {
    writer.writeUint16(this.version);
    writer.writeInt16(this.xAvgCharWidth);
    writer.writeUint16(this.usWeightClass);
    writer.writeUint16(this.usWidthClass);
    writer.writeUint16(this.fsType);
    writer.writeInt16(this.ySubscriptXSize);
    writer.writeInt16(this.ySubscriptYSize);
    writer.writeInt16(this.ySubscriptXOffset);
    writer.writeInt16(this.ySubscriptYOffset);
    writer.writeInt16(this.ySuperscriptXSize);
    writer.writeInt16(this.ySuperscriptYSize);
    writer.writeInt16(this.ySuperscriptXOffset);
    writer.writeInt16(this.ySuperscriptYOffset);
    writer.writeInt16(this.yStrikeoutSize);
    writer.writeInt16(this.yStrikeoutPosition);
    writer.writeInt16(this.sFamilyClass);
    for (const byte of this.panose) {
      writer.writeUint8(byte);
    }
    writer.writeUint32(this.ulUnicodeRange1);
    writer.writeUint32(this.ulUnicodeRange2);
    writer.writeUint32(this.ulUnicodeRange3);
    writer.writeUint32(this.ulUnicodeRange4);
    writeTag(writer, this.achVendID);
    writer.writeUint16(this.fsSelection);
    writer.writeUint16(this.usFirstCharIndex);
    writer.writeUint16(this.usLastCharIndex);
    writer.writeInt16(this.sTypoAscender);
    writer.writeInt16(this.sTypoDescender);
    writer.writeInt16(this.sTypoLineGap);
    writer.writeUint16(this.usWinAscent);
    writer.writeUint16(this.usWinDescent);

    if (this.version >= 1) {
      writer.writeUint32(this.ulCodePageRange1);
      writer.writeUint32(this.ulCodePageRange2);
    }

    if (this.version >= 2) {
      writer.writeInt16(this.sxHeight);
      writer.writeInt16(this.sCapHeight);
      writer.writeUint16(this.usDefaultChar);
      writer.writeUint16(this.usBreakChar);
      writer.writeUint16(this.usMaxContext);
    }

    if (this.version >= 5) {
      writer.writeUint16(this.usLowerOpticalPointSize);
      writer.writeUint16(this.usUpperOpticalPointSize);
    }
  }
}

function writeTag(writer: DataWriter, tag: string): void {
  const padded = tag.padEnd(4, ' ').slice(0, 4);
  for (let i = 0; i < 4; i++) {
    writer.writeUint8(padded.charCodeAt(i));
  }
}

/**
 * Embedding licensing flags for fsType field.
 * Can be combined with bitwise OR.
 */
export const FsType = {
  /** Installable embedding */
  installable: 0x0000 as const,
  /** Restricted License embedding */
  restricted: 0x0002 as const,
  /** Preview & Print embedding */
  previewAndPrint: 0x0004 as const,
  /** Editable embedding */
  editable: 0x0008 as const,
  /** No subsetting */
  noSubsetting: 0x0100 as const,
  /** Bitmap embedding only */
  bitmapOnly: 0x0200 as const,
};

/**
 * Selection flags for fsSelection field.
 * Can be combined with bitwise OR.
 */
export const FsSelection = {
  italic: 0x0001 as const,
  underscore: 0x0002 as const,
  negative: 0x0004 as const,
  outlined: 0x0008 as const,
  strikeout: 0x0010 as const,
  bold: 0x0020 as const,
  regular: 0x0040 as const,
  useTypoMetrics: 0x0080 as const,
  wws: 0x0100 as const,
  oblique: 0x0200 as const,
};
