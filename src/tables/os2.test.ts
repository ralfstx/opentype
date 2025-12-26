import { describe, expect, it } from 'vitest';

import { fromHexString, toHexString } from '../../test/utils.ts';
import { DataWriter } from '../data-writer.ts';
import { FsSelection, FsType, Os2Table, Os2TableBuilder } from './os2.ts';

describe('Os2Table', () => {
  describe('read', () => {
    it('reads version 4 table', () => {
      const data = fromHexString(
        '00 04', // version
        '02 58', // xAvgCharWidth (600)
        '01 90', // usWeightClass (400)
        '00 05', // usWidthClass (5)
        '00 00', // fsType
        '00 41', // ySubscriptXSize (65)
        '00 42', // ySubscriptYSize (66)
        '00 01', // ySubscriptXOffset
        '00 02', // ySubscriptYOffset
        '00 43', // ySuperscriptXSize (67)
        '00 44', // ySuperscriptYSize (68)
        '00 03', // ySuperscriptXOffset
        '00 04', // ySuperscriptYOffset
        '00 32', // yStrikeoutSize (50)
        '01 2c', // yStrikeoutPosition (300)
        '00 00', // sFamilyClass
        '02 00 05 00 00 00 00 00 00 00', // panose
        '00 00 00 03', // ulUnicodeRange1
        '00 00 00 00', // ulUnicodeRange2
        '00 00 00 00', // ulUnicodeRange3
        '00 00 00 00', // ulUnicodeRange4
        '41 42 43 44', // achVendID ("ABCD")
        '00 40', // fsSelection (regular)
        '00 20', // usFirstCharIndex (32)
        'ff ff', // usLastCharIndex
        '02 bc', // sTypoAscender (700)
        'fe d4', // sTypoDescender (-300)
        '00 5a', // sTypoLineGap (90)
        '02 bc', // usWinAscent (700)
        '01 2c', // usWinDescent (300)
        '00 00 00 01', // ulCodePageRange1
        '00 00 00 00', // ulCodePageRange2
        '01 f4', // sxHeight (500)
        '02 bc', // sCapHeight (700)
        '00 00', // usDefaultChar
        '00 20', // usBreakChar (32)
        '00 02', // usMaxContext
      );

      const table = Os2Table.read(data);

      expect(table.version).toBe(4);
      expect(table.xAvgCharWidth).toBe(600);
      expect(table.usWeightClass).toBe(400);
      expect(table.usWidthClass).toBe(5);
      expect(table.fsType).toBe(0);
      expect(table.ySubscriptXSize).toBe(65);
      expect(table.ySubscriptYSize).toBe(66);
      expect(table.ySuperscriptXSize).toBe(67);
      expect(table.ySuperscriptYSize).toBe(68);
      expect(table.yStrikeoutSize).toBe(50);
      expect(table.yStrikeoutPosition).toBe(300);
      expect(table.panose).toEqual([2, 0, 5, 0, 0, 0, 0, 0, 0, 0]);
      expect(table.ulUnicodeRange1).toBe(3);
      expect(table.achVendID).toBe('ABCD');
      expect(table.fsSelection).toBe(0x40);
      expect(table.usFirstCharIndex).toBe(32);
      expect(table.usLastCharIndex).toBe(0xffff);
      expect(table.sTypoAscender).toBe(700);
      expect(table.sTypoDescender).toBe(-300);
      expect(table.sTypoLineGap).toBe(90);
      expect(table.usWinAscent).toBe(700);
      expect(table.usWinDescent).toBe(300);
      expect(table.ulCodePageRange1).toBe(1);
      expect(table.ulCodePageRange2).toBe(0);
      expect(table.sxHeight).toBe(500);
      expect(table.sCapHeight).toBe(700);
      expect(table.usDefaultChar).toBe(0);
      expect(table.usBreakChar).toBe(32);
      expect(table.usMaxContext).toBe(2);
    });
  });
});

describe('Os2TableBuilder', () => {
  describe('constructor', () => {
    it('sets all given values from existing table', () => {
      const data = fromHexString(
        '00 04', // version
        '02 58', // xAvgCharWidth (600)
        '01 90', // usWeightClass (400)
        '00 05', // usWidthClass (5)
        '00 04', // fsType (preview & print)
        '00 41', // ySubscriptXSize (65)
        '00 42', // ySubscriptYSize (66)
        '00 01', // ySubscriptXOffset
        '00 02', // ySubscriptYOffset
        '00 43', // ySuperscriptXSize (67)
        '00 44', // ySuperscriptYSize (68)
        '00 03', // ySuperscriptXOffset
        '00 04', // ySuperscriptYOffset
        '00 32', // yStrikeoutSize (50)
        '01 2c', // yStrikeoutPosition (300)
        '00 00', // sFamilyClass
        '02 00 05 00 00 00 00 00 00 00', // panose
        '00 00 00 03', // ulUnicodeRange1
        '00 00 00 00', // ulUnicodeRange2
        '00 00 00 00', // ulUnicodeRange3
        '00 00 00 00', // ulUnicodeRange4
        '41 42 43 44', // achVendID ("ABCD")
        '00 40', // fsSelection (regular)
        '00 20', // usFirstCharIndex (32)
        'ff ff', // usLastCharIndex
        '02 bc', // sTypoAscender (700)
        'fe d4', // sTypoDescender (-300)
        '00 5a', // sTypoLineGap (90)
        '02 bc', // usWinAscent (700)
        '01 2c', // usWinDescent (300)
        '00 00 00 01', // ulCodePageRange1
        '00 00 00 00', // ulCodePageRange2
        '01 f4', // sxHeight (500)
        '02 bc', // sCapHeight (700)
        '00 00', // usDefaultChar
        '00 20', // usBreakChar (32)
        '00 02', // usMaxContext
      );
      const table = Os2Table.read(data);

      const builder = new Os2TableBuilder(table);

      expect(builder.version).toBe(4);
      expect(builder.xAvgCharWidth).toBe(600);
      expect(builder.usWeightClass).toBe(400);
      expect(builder.usWidthClass).toBe(5);
      expect(builder.fsType).toBe(4);
      expect(builder.achVendID).toBe('ABCD');
      expect(builder.fsSelection).toBe(0x40);
      expect(builder.sTypoAscender).toBe(700);
      expect(builder.sTypoDescender).toBe(-300);
      expect(builder.sCapHeight).toBe(700);
      expect(builder.sxHeight).toBe(500);
    });

    it('uses sensible defaults when no init provided', () => {
      const builder = new Os2TableBuilder();

      expect(builder.version).toBe(4);
      expect(builder.xAvgCharWidth).toBe(0);
      expect(builder.usWeightClass).toBe(400);
      expect(builder.usWidthClass).toBe(5);
      expect(builder.fsType).toBe(0);
      expect(builder.panose).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(builder.achVendID).toBe('    ');
      expect(builder.fsSelection).toBe(0);
      expect(builder.usFirstCharIndex).toBe(0);
      expect(builder.usLastCharIndex).toBe(0xffff);
      expect(builder.usBreakChar).toBe(0x0020);
      expect(builder.usUpperOpticalPointSize).toBe(0xffff);
    });
  });

  describe('writeTable', () => {
    it('writes version 0 table', () => {
      const builder = new Os2TableBuilder();
      builder.version = 0;
      builder.xAvgCharWidth = 500;
      builder.usWeightClass = 400;
      builder.usWidthClass = 5;
      builder.achVendID = 'TEST';
      builder.sTypoAscender = 800;
      builder.sTypoDescender = -200;
      builder.usWinAscent = 900;
      builder.usWinDescent = 200;

      const writer = new DataWriter();
      builder.writeTable(writer);

      expect(writer.byteLength).toBe(78); // Version 0 size
    });

    it('writes version 1 table with code page ranges', () => {
      const builder = new Os2TableBuilder();
      builder.version = 1;
      builder.ulCodePageRange1 = 0x00000001;
      builder.ulCodePageRange2 = 0x00000000;

      const writer = new DataWriter();
      builder.writeTable(writer);

      expect(writer.byteLength).toBe(86); // Version 1 size (78 + 8)
    });

    it('writes version 4 table with all fields', () => {
      const builder = new Os2TableBuilder();
      builder.version = 4;
      builder.xAvgCharWidth = 600;
      builder.usWeightClass = 700;
      builder.usWidthClass = 5;
      builder.fsType = FsType.editable;
      builder.ySubscriptXSize = 65;
      builder.ySubscriptYSize = 66;
      builder.ySubscriptXOffset = 1;
      builder.ySubscriptYOffset = 2;
      builder.ySuperscriptXSize = 67;
      builder.ySuperscriptYSize = 68;
      builder.ySuperscriptXOffset = 3;
      builder.ySuperscriptYOffset = 4;
      builder.yStrikeoutSize = 50;
      builder.yStrikeoutPosition = 300;
      builder.sFamilyClass = 0;
      builder.panose = [2, 0, 5, 0, 0, 0, 0, 0, 0, 0];
      builder.ulUnicodeRange1 = 3;
      builder.achVendID = 'ABCD';
      builder.fsSelection = FsSelection.regular | FsSelection.bold;
      builder.usFirstCharIndex = 32;
      builder.usLastCharIndex = 0xffff;
      builder.sTypoAscender = 700;
      builder.sTypoDescender = -300;
      builder.sTypoLineGap = 90;
      builder.usWinAscent = 700;
      builder.usWinDescent = 300;
      builder.ulCodePageRange1 = 1;
      builder.sxHeight = 500;
      builder.sCapHeight = 700;
      builder.usBreakChar = 32;
      builder.usMaxContext = 2;

      const writer = new DataWriter();
      builder.writeTable(writer);
      const result = writer.getData();

      expect(writer.byteLength).toBe(96); // Version 2-4 size
      expect(toHexString(result)).toEqual(
        [
          '00 04', // version
          '02 58', // xAvgCharWidth (600)
          '02 bc', // usWeightClass (700)
          '00 05', // usWidthClass (5)
          '00 08', // fsType (editable)
          '00 41', // ySubscriptXSize (65)
          '00 42', // ySubscriptYSize (66)
          '00 01', // ySubscriptXOffset
          '00 02', // ySubscriptYOffset
          '00 43', // ySuperscriptXSize (67)
          '00 44', // ySuperscriptYSize (68)
          '00 03', // ySuperscriptXOffset
          '00 04', // ySuperscriptYOffset
          '00 32', // yStrikeoutSize (50)
          '01 2c', // yStrikeoutPosition (300)
          '00 00', // sFamilyClass
          '02 00 05 00 00 00 00 00 00 00', // panose
          '00 00 00 03', // ulUnicodeRange1
          '00 00 00 00', // ulUnicodeRange2
          '00 00 00 00', // ulUnicodeRange3
          '00 00 00 00', // ulUnicodeRange4
          '41 42 43 44', // achVendID ("ABCD")
          '00 60', // fsSelection (regular | bold)
          '00 20', // usFirstCharIndex (32)
          'ff ff', // usLastCharIndex
          '02 bc', // sTypoAscender (700)
          'fe d4', // sTypoDescender (-300)
          '00 5a', // sTypoLineGap (90)
          '02 bc', // usWinAscent (700)
          '01 2c', // usWinDescent (300)
          '00 00 00 01', // ulCodePageRange1
          '00 00 00 00', // ulCodePageRange2
          '01 f4', // sxHeight (500)
          '02 bc', // sCapHeight (700)
          '00 00', // usDefaultChar
          '00 20', // usBreakChar (32)
          '00 02', // usMaxContext
        ].join(' '),
      );
    });

    it('writes version 5 table with optical size fields', () => {
      const builder = new Os2TableBuilder();
      builder.version = 5;
      builder.usLowerOpticalPointSize = 80; // 8pt in twips
      builder.usUpperOpticalPointSize = 720; // 72pt in twips

      const writer = new DataWriter();
      builder.writeTable(writer);

      expect(writer.byteLength).toBe(100); // Version 5 size (96 + 4)
    });

    it('roundtrip: read and write produces same data', () => {
      const original = fromHexString(
        '00 04', // version
        '02 58', // xAvgCharWidth (600)
        '01 90', // usWeightClass (400)
        '00 05', // usWidthClass (5)
        '00 00', // fsType
        '00 41', // ySubscriptXSize (65)
        '00 42', // ySubscriptYSize (66)
        '00 01', // ySubscriptXOffset
        '00 02', // ySubscriptYOffset
        '00 43', // ySuperscriptXSize (67)
        '00 44', // ySuperscriptYSize (68)
        '00 03', // ySuperscriptXOffset
        '00 04', // ySuperscriptYOffset
        '00 32', // yStrikeoutSize (50)
        '01 2c', // yStrikeoutPosition (300)
        '00 00', // sFamilyClass
        '02 00 05 00 00 00 00 00 00 00', // panose
        '00 00 00 03', // ulUnicodeRange1
        '00 00 00 00', // ulUnicodeRange2
        '00 00 00 00', // ulUnicodeRange3
        '00 00 00 00', // ulUnicodeRange4
        '41 42 43 44', // achVendID ("ABCD")
        '00 40', // fsSelection (regular)
        '00 20', // usFirstCharIndex (32)
        'ff ff', // usLastCharIndex
        '02 bc', // sTypoAscender (700)
        'fe d4', // sTypoDescender (-300)
        '00 5a', // sTypoLineGap (90)
        '02 bc', // usWinAscent (700)
        '01 2c', // usWinDescent (300)
        '00 00 00 01', // ulCodePageRange1
        '00 00 00 00', // ulCodePageRange2
        '01 f4', // sxHeight (500)
        '02 bc', // sCapHeight (700)
        '00 00', // usDefaultChar
        '00 20', // usBreakChar (32)
        '00 02', // usMaxContext
      );

      const table = Os2Table.read(original);
      const builder = new Os2TableBuilder(table);

      const writer = new DataWriter();
      builder.writeTable(writer);

      expect(toHexString(writer.getData())).toEqual(toHexString(original));
    });
  });
});

describe('FsType', () => {
  it('embedding flags can be combined', () => {
    expect(FsType.installable).toBe(0x0000);
    expect(FsType.restricted).toBe(0x0002);
    expect(FsType.previewAndPrint).toBe(0x0004);
    expect(FsType.editable).toBe(0x0008);
    expect(FsType.noSubsetting).toBe(0x0100);
    expect(FsType.bitmapOnly).toBe(0x0200);
    expect(FsType.editable | FsType.noSubsetting).toBe(0x0108);
  });
});

describe('FsSelection', () => {
  it('selection flags can be combined', () => {
    expect(FsSelection.italic).toBe(0x0001);
    expect(FsSelection.bold).toBe(0x0020);
    expect(FsSelection.regular).toBe(0x0040);
    expect(FsSelection.useTypoMetrics).toBe(0x0080);
    expect(FsSelection.italic | FsSelection.bold).toBe(0x0021);
  });
});
