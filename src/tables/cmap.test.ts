import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import {
  CmapSubtable0Writer,
  CmapSubtable4Writer,
  CmapSubtable6Writer,
  CmapSubtable10Writer,
  CmapSubtable12Or13Writer,
  CmapTableWriter,
  readCmapSubtableFormat0,
  readCmapSubtableFormat4,
  readCmapSubtableFormat6,
  readCmapSubtableFormat10,
  readCmapSubtableFormat12Or13,
  readCmapTable,
  selectBestSubtable,
} from 'src/tables/cmap.ts';
import { describe, expect, test } from 'vitest';

describe('cmap', () => {
  describe('readCmapTable', () => {
    test('reads encoding records', () => {
      const writer = new DataWriter();
      // cmap
      writer.writeUint16(0); // version
      writer.writeUint16(2); // numTables
      // record 1
      writer.writeUint16(0); // platformID
      writer.writeUint16(0); // encodingID
      writer.writeUint32(20); // subtableOffset
      // record 2
      writer.writeUint16(3); // platformID
      writer.writeUint16(0); // encodingID
      writer.writeUint32(40); // subtableOffset
      // subtable 1
      writer.writeUint16(0); // format
      writer.writeUint16(262); // length
      writer.writeUint16(0); // language
      for (let i = 0; i < 256; i++) {
        writer.writeUint8(i);
      }
      // subtable 2
      writer.writeUint16(0); // format
      writer.writeUint16(262); // length
      writer.writeUint16(0); // language
      for (let i = 0; i < 256; i++) {
        writer.writeUint8(i);
      }
      const data = writer.getData();

      const table = readCmapTable(data);

      expect(table).toEqual({
        encodingRecords: [
          {
            platformID: 0,
            encodingID: 0,
            readSubtable: expect.any(Function),
          },
          {
            platformID: 3,
            encodingID: 0,
            readSubtable: expect.any(Function),
          },
        ],
      });

      const subtable1 = table.encodingRecords[0].readSubtable();

      expect(subtable1.format).toBe(0);
      for (let i = 0; i < 256; i++) {
        expect(subtable1.lookupGlyphId(i)).toBe(i);
      }

      const subtable2 = table.encodingRecords[0].readSubtable();

      expect(subtable2.format).toBe(0);
      for (let i = 0; i < 256; i++) {
        expect(subtable2.lookupGlyphId(i)).toBe(i);
      }
    });
  });

  describe('format 0', () => {
    test('reads subtable', () => {
      const writer = new DataWriter();
      writer.writeUint16(0); // format
      writer.writeUint16(262); // length
      writer.writeUint16(0); // language
      for (let i = 0; i < 256; i++) {
        writer.writeUint8(i);
      }
      const data = writer.getData();

      const subtable = readCmapSubtableFormat0(new DataReader(data));

      expect(subtable.format).toBe(0);
      const glyphMappings = subtable.readAllMappings();
      expect(glyphMappings!.size).toBe(255); // 0 is not mapped
      for (let i = 0; i < 256; i++) {
        expect(subtable.lookupGlyphId(i)).toBe(i);
        expect(glyphMappings!.get(i)).toBe(i || undefined); // 0 is not mapped
      }
    });

    test('writes subtable', () => {
      const writer = new DataWriter();
      const glyphIds = new Array(256).fill(0).map((_, i) => i);

      new CmapSubtable0Writer(0, 0, glyphIds).writeSubtable(writer);

      const data = writer.getData();
      const subtable = readCmapSubtableFormat0(new DataReader(data));
      expect(subtable.format).toBe(0);
      for (let i = 0; i < 256; i++) {
        expect(subtable.lookupGlyphId(i)).toBe(i);
      }
    });
  });

  describe('format 4', () => {
    test('reads subtable', () => {
      const writer = new DataWriter();
      writer.writeUint16(4); // format
      const lengthPos = writer.position;
      writer.writeUint16(0); // length
      writer.writeUint16(0); // language
      writer.writeUint16(8); // segCountX2
      writer.writeUint16(0); // searchRange
      writer.writeUint16(0); // entrySelector
      writer.writeUint16(0); // rangeShift
      // endCode
      const endCodes = [1, 2, 3, 4];
      endCodes.forEach((endCode) => writer.writeUint16(endCode));
      writer.writeUint16(0); // reservedPad
      // startCode
      const startCodes = [1, 2, 3, 4];
      startCodes.forEach((startCode) => writer.writeUint16(startCode));
      // idDelta
      const idDeltas = [1, 2, 3, 4];
      idDeltas.forEach((idDelta) => writer.writeInt16(idDelta));
      // idRangeOffset
      const idRangeOffsets = [1, 2, 3, 4];
      idRangeOffsets.forEach((idRangeOffset) => writer.writeUint16(idRangeOffset));
      // glyphIdArray
      const glyphIds = [1, 2, 3, 4];
      glyphIds.forEach((glyphId) => writer.writeUint16(glyphId));
      // finalize
      const length = writer.position;
      writer.reset(lengthPos).writeUint16(length).reset(length);
      const data = writer.getData();

      const subtable = readCmapSubtableFormat4(new DataReader(data));

      expect(subtable.format).toBe(4);
      const glyphMappings = subtable.readAllMappings();
      glyphMappings!.forEach((glyphId, charCode) => {
        expect(subtable.lookupGlyphId(charCode)).toBe(glyphId);
      });
    });

    test('writes subtable', () => {
      const writer = new DataWriter();
      const segments = [
        { startCode: 21, endCode: 22 }, // identity mapping
        { startCode: 23, endCode: 25, idDelta: 3 }, // shift with idDelta
        { startCode: 31, endCode: 35, idDelta: 3, glyphIdOffset: 0 }, // shift with glyphIdOffset
        { endCode: 0xffff, startCode: 0xffff },
      ];
      const glyphIds = [100, 101, 102, 103, 104, 105, 106, 107];
      const subtableWriter = new CmapSubtable4Writer(0, 0, segments, glyphIds);
      subtableWriter.writeSubtable(writer);

      const data = writer.getData();
      const subtable = readCmapSubtableFormat4(new DataReader(data));
      expect(subtable.format).toBe(4);
      const allMappings = subtable.readAllMappings();
      expect(allMappings!.size).toBe(10);
      allMappings.forEach((glyphId, charCode) => {
        expect(subtable.lookupGlyphId(charCode)).toBe(glyphId);
      });
      expect(subtable.lookupGlyphId(20)).toBe(0);
      expect(subtable.lookupGlyphId(21)).toBe(21);
      expect(subtable.lookupGlyphId(22)).toBe(22);
      expect(subtable.lookupGlyphId(23)).toBe(26);
      expect(subtable.lookupGlyphId(25)).toBe(28);
      expect(subtable.lookupGlyphId(30)).toBe(0);
      expect(subtable.lookupGlyphId(31)).toBe(103);
      expect(subtable.lookupGlyphId(35)).toBe(107);
      expect(subtable.lookupGlyphId(36)).toBe(0);
    });
  });

  describe('format 6', () => {
    test('reads subtable', () => {
      const writer = new DataWriter();
      writer.writeUint16(6); // format
      writer.writeUint16(16); // length
      writer.writeUint16(0); // language
      writer.writeUint16(23); // firstCode
      writer.writeUint16(3); // entryCount
      for (let i = 0; i < 3; i++) {
        writer.writeUint16(i + 1);
      }
      const data = writer.getData();

      const subtable = readCmapSubtableFormat6(new DataReader(data));

      expect(subtable.format).toBe(6);
      expect(subtable.lookupGlyphId(22)).toBe(0);
      expect(subtable.lookupGlyphId(23)).toBe(1);
      expect(subtable.lookupGlyphId(24)).toBe(2);
      expect(subtable.lookupGlyphId(25)).toBe(3);
      expect(subtable.lookupGlyphId(26)).toBe(0);
    });

    test('writes subtable', () => {
      const writer = new DataWriter();
      const glyphIds = new Array(256).fill(0).map((_, i) => i);

      const subtableWriter = new CmapSubtable6Writer(0, 0, 23, glyphIds);
      subtableWriter.writeSubtable(writer);

      const data = writer.getData();
      const subtable = readCmapSubtableFormat6(new DataReader(data));
      expect(subtable.format).toBe(6);
      expect(subtable.lookupGlyphId(22)).toBe(0);
      for (let i = 0; i < 256; i++) {
        expect(subtable.lookupGlyphId(i + 23)).toBe(i);
      }
    });
  });

  describe('format 10', () => {
    test('reads subtable', () => {
      const writer = new DataWriter();
      writer.writeUint16(10); // format
      writer.writeUint16(0); // reserved
      writer.writeUint32(26); // length
      writer.writeUint32(0); // language
      writer.writeUint32(23); // startCharCode
      writer.writeUint32(3); // numChars
      for (let i = 0; i < 3; i++) {
        writer.writeUint16(i + 1);
      }
      const data = writer.getData();

      const subtable = readCmapSubtableFormat10(new DataReader(data));

      expect(subtable.format).toBe(10);
      expect(subtable.lookupGlyphId(22)).toBe(0);
      expect(subtable.lookupGlyphId(23)).toBe(1);
      expect(subtable.lookupGlyphId(24)).toBe(2);
      expect(subtable.lookupGlyphId(25)).toBe(3);
      expect(subtable.lookupGlyphId(26)).toBe(0);
    });

    test('writes subtable', () => {
      const writer = new DataWriter();
      const glyphIds = new Array(256).fill(0).map((_, i) => i);

      const subtableWriter = new CmapSubtable10Writer(0, 0, 23, glyphIds);
      subtableWriter.writeSubtable(writer);

      const data = writer.getData();
      const subtable = readCmapSubtableFormat10(new DataReader(data));
      expect(subtable.format).toBe(10);
      expect(subtable.lookupGlyphId(22)).toBe(0);
      for (let i = 0; i < 256; i++) {
        expect(subtable.lookupGlyphId(i + 23)).toBe(i);
      }
    });
  });

  describe('format 12', () => {
    test('writes and reads subtable', () => {
      const writer = new DataWriter();
      const groups = [
        {
          startCharCode: 21,
          endCharCode: 26,
          startGlyphID: 1,
        },
        {
          startCharCode: 31,
          endCharCode: 36,
          startGlyphID: 11,
        },
      ];

      const subtableWriter = new CmapSubtable12Or13Writer(0, 0, 12, groups);
      subtableWriter.writeSubtable(writer);

      const data = writer.getData();
      const subtable = readCmapSubtableFormat12Or13(new DataReader(data), 12);
      expect(subtable.format).toBe(12);
      const allMappings = subtable.readAllMappings();
      expect(allMappings!.size).toBe(12);
      allMappings.forEach((glyphId, charCode) => {
        expect(subtable.lookupGlyphId(charCode)).toBe(glyphId);
      });
      expect(subtable.lookupGlyphId(20)).toBe(0);
      expect(subtable.lookupGlyphId(21)).toBe(1);
      expect(subtable.lookupGlyphId(26)).toBe(6);
      expect(subtable.lookupGlyphId(30)).toBe(0);
      expect(subtable.lookupGlyphId(31)).toBe(11);
      expect(subtable.lookupGlyphId(36)).toBe(16);
      expect(subtable.lookupGlyphId(37)).toBe(0);
    });
  });
});

describe('selectBestSubtable', () => {
  test('selects format 0', () => {
    const writer = new DataWriter();
    const cmap = new CmapTableWriter();
    cmap.addSubtable(new CmapSubtable0Writer(3, 1, [1, 2, 3]));
    cmap.addSubtable(new CmapSubtable0Writer(3, 10, [1, 2, 3]));
    cmap.writeTable(writer);
    const data = writer.getData();

    const subtable = selectBestSubtable(readCmapTable(data));

    expect([subtable?.platformID, subtable?.encodingID]).toEqual([3, 10]);
  });
});
