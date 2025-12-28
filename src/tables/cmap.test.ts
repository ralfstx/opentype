import { describe, expect, it } from 'vitest';

import { DataReader, subDataView } from '../data-reader.ts';
import { DataWriter } from '../data-writer.ts';
import {
  CmapSubtable4Writer,
  CmapSubtable12Writer,
  CmapTable,
  CmapTableBuilder,
  CmapTableWriter,
  readCmapSubtableFormat0,
  readCmapSubtableFormat4,
  readCmapSubtableFormat6,
  readCmapSubtableFormat10,
  readCmapSubtableFormat12Or13,
  selectBestCmapSubtable,
} from '../tables/cmap.ts';
import { toHexString } from '../test-utils.ts';

describe('cmap', () => {
  describe('read', () => {
    it('reads encoding records', () => {
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
      writer.writeUint32(282); // subtableOffset (20 + 262 bytes for subtable 1)
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

      const table = CmapTable.read(data);

      expect(table.encodingRecords).toEqual([
        {
          platformID: 0,
          encodingID: 0,
          readSubtable: expect.any(Function) as unknown,
        },
        {
          platformID: 3,
          encodingID: 0,
          readSubtable: expect.any(Function) as unknown,
        },
      ]);
      const subtable1 = table.encodingRecords[0].readSubtable();
      expect(subtable1.format).toBe(0);
      const glyphMapping1 = subtable1.readGlyphMapping();
      for (let i = 0; i < 256; i++) {
        expect(glyphMapping1.get(i)).toBe(i || undefined); // 0 is not mapped
      }
      const subtable2 = table.encodingRecords[1].readSubtable();
      const glyphMapping2 = subtable2.readGlyphMapping();
      expect(subtable2.format).toBe(0);
      for (let i = 0; i < 256; i++) {
        expect(glyphMapping2.get(i)).toBe(i || undefined); // 0 is not mapped
      }
    });
  });

  describe('format 0', () => {
    it('reads subtable', () => {
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
      const glyphMapping = subtable.readGlyphMapping();
      expect(glyphMapping.size).toBe(255); // 0 is not mapped
      for (let i = 0; i < 256; i++) {
        expect(glyphMapping.get(i)).toBe(i || undefined); // 0 is not mapped
      }
    });
  });

  describe('format 4', () => {
    it('reads subtable', () => {
      const writer = new DataWriter();
      writer.writeUint16(4); // format
      const lengthPos = writer.position;
      writer.writeUint16(0); // length
      writer.writeUint16(0); // language
      writer.writeUint16(10); // segCountX2 (5 segments * 2)
      writer.writeUint16(0); // searchRange
      writer.writeUint16(0); // entrySelector
      writer.writeUint16(0); // rangeShift
      // endCode
      const endCodes = [1, 2, 3, 4, 0xffff];
      endCodes.forEach((endCode) => writer.writeUint16(endCode));
      writer.writeUint16(0); // reservedPad
      // startCode
      const startCodes = [1, 2, 3, 4, 0xffff];
      startCodes.forEach((startCode) => writer.writeUint16(startCode));
      // idDelta
      const idDeltas = [0, 0, 0, 0, 1];
      idDeltas.forEach((idDelta) => writer.writeInt16(idDelta));
      // idRangeOffset
      const idRangeOffsets = [10, 10, 10, 10, 0];
      idRangeOffsets.forEach((idRangeOffset) => writer.writeUint16(idRangeOffset));
      // glyphIdArray
      const glyphIds = [1, 2, 3, 4];
      glyphIds.forEach((glyphId) => writer.writeUint16(glyphId));
      // finalize
      const length = writer.position;
      writer.seek(lengthPos).writeUint16(length).seek(length);
      const data = writer.getData();

      const subtable = readCmapSubtableFormat4(new DataReader(data));

      expect(subtable.format).toBe(4);
      const glyphMapping = subtable.readGlyphMapping();
      expect(glyphMapping.size).toBe(4);
      expect(glyphMapping.get(0)).toBeUndefined();
      expect(glyphMapping.get(1)).toBe(1);
      expect(glyphMapping.get(2)).toBe(2);
      expect(glyphMapping.get(3)).toBe(3);
      expect(glyphMapping.get(4)).toBe(4);
      expect(glyphMapping.get(5)).toBeUndefined();
    });

    it('writes subtable', () => {
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
      const glyphMapping = subtable.readGlyphMapping();
      expect(glyphMapping.size).toBe(10);
      expect(glyphMapping.get(20)).toBeUndefined();
      expect(glyphMapping.get(21)).toBe(21);
      expect(glyphMapping.get(22)).toBe(22);
      expect(glyphMapping.get(23)).toBe(26);
      expect(glyphMapping.get(25)).toBe(28);
      expect(glyphMapping.get(30)).toBeUndefined();
      expect(glyphMapping.get(31)).toBe(103);
      expect(glyphMapping.get(35)).toBe(107);
      expect(glyphMapping.get(36)).toBeUndefined();
    });
  });

  describe('format 6', () => {
    it('reads subtable', () => {
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
      const glyphMapping = subtable.readGlyphMapping();
      expect(glyphMapping.size).toBe(3);
      expect(glyphMapping.get(22)).toBeUndefined();
      expect(glyphMapping.get(23)).toBe(1);
      expect(glyphMapping.get(24)).toBe(2);
      expect(glyphMapping.get(25)).toBe(3);
      expect(glyphMapping.get(26)).toBeUndefined();
    });
  });

  describe('format 10', () => {
    it('reads subtable', () => {
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
      const glyphMapping = subtable.readGlyphMapping();
      expect(glyphMapping.size).toBe(3);
      expect(glyphMapping.get(22)).toBeUndefined();
      expect(glyphMapping.get(23)).toBe(1);
      expect(glyphMapping.get(24)).toBe(2);
      expect(glyphMapping.get(25)).toBe(3);
      expect(glyphMapping.get(26)).toBeUndefined();
    });
  });

  describe('format 12', () => {
    it('writes and reads subtable', () => {
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

      const subtableWriter = new CmapSubtable12Writer(0, 0, groups);
      subtableWriter.writeSubtable(writer);

      const data = writer.getData();
      const subtable = readCmapSubtableFormat12Or13(new DataReader(data), 12);
      expect(subtable.format).toBe(12);
      const glyphMapping = subtable.readGlyphMapping();
      expect(glyphMapping.size).toBe(12);
      expect(glyphMapping.get(20)).toBeUndefined();
      expect(glyphMapping.get(21)).toBe(1);
      expect(glyphMapping.get(26)).toBe(6);
      expect(glyphMapping.get(30)).toBeUndefined();
      expect(glyphMapping.get(31)).toBe(11);
      expect(glyphMapping.get(36)).toBe(16);
      expect(glyphMapping.get(37)).toBeUndefined();
    });
  });

  describe('CmapTableWriter', () => {
    it('writes table', () => {
      const writer = new DataWriter();
      const cmap = new CmapTableWriter();
      const segments = [{ endCode: 0xffff, startCode: 0xffff }];
      cmap.addSubtable(new CmapSubtable4Writer(3, 1, segments, []));
      cmap.addSubtable(new CmapSubtable4Writer(3, 10, segments, []));

      cmap.writeTable(writer);

      const data = writer.getData();
      expect(toHexString(subDataView(data, 0, 20))).toEqual(
        [
          '00 00', // version
          '00 02', // numTables
          '00 03', // platformID
          '00 01', // encodingID
          '00 00 00 14', // subtableOffset = 20
          '00 03', // platformID
          '00 0a', // encodingID
          '00 00 00 2c', // subtableOffset = 44 (20 + 24 bytes for first format 4 subtable)
        ].join(' '),
      );
      const subtable1 = readCmapSubtableFormat4(new DataReader(subDataView(data, 20, 24)));
      const subtable2 = readCmapSubtableFormat4(new DataReader(subDataView(data, 44, 24)));
      expect(subtable1.format).toBe(4);
      expect(subtable2.format).toBe(4);
    });
  });

  describe('selectBestSubtable', () => {
    it('selects best subtable', () => {
      const writer = new DataWriter();
      const cmap = new CmapTableWriter();
      const segments1 = [
        { startCode: 1, endCode: 3, idDelta: 10 },
        { endCode: 0xffff, startCode: 0xffff },
      ];
      const segments2 = [
        { startCode: 1, endCode: 3, idDelta: 20 },
        { endCode: 0xffff, startCode: 0xffff },
      ];
      cmap.addSubtable(new CmapSubtable4Writer(3, 1, segments1, []));
      cmap.addSubtable(new CmapSubtable4Writer(3, 10, segments2, []));
      cmap.writeTable(writer);
      const table = CmapTable.read(writer.getData());

      const subtable = selectBestCmapSubtable(table);
      expect(subtable!.format).toBe(4);
      const glyphMapping = subtable!.readGlyphMapping();
      expect(glyphMapping.size).toBe(3);
      expect(glyphMapping.get(1)).toBe(21);
    });
  });

  describe('CmapTableWriter', () => {
    it('writes table at non-zero offset', () => {
      const writer = new DataWriter();
      // Write some padding data to simulate the writer not starting at position 0
      writer.writeUint32(0xdeadbeef);
      writer.writeUint32(0xcafebabe);
      const tableStart = writer.position; // offset 8

      const cmap = new CmapTableWriter();
      const groups = [{ startCharCode: 0x41, endCharCode: 0x5a, startGlyphID: 1 }];
      cmap.addSubtable(new CmapSubtable12Writer(3, 10, groups));
      cmap.addSubtable(new CmapSubtable12Writer(0, 4, groups));
      cmap.writeTable(writer);

      // Read back the cmap table from the correct offset
      const cmapData = subDataView(writer.getData(), tableStart);
      const table = CmapTable.read(cmapData);

      expect(table.encodingRecords).toHaveLength(2);
      expect(table.encodingRecords[0].platformID).toBe(3);
      expect(table.encodingRecords[0].encodingID).toBe(10);
      expect(table.encodingRecords[1].platformID).toBe(0);
      expect(table.encodingRecords[1].encodingID).toBe(4);

      // Verify the subtables can be read correctly
      const subtable1 = table.encodingRecords[0].readSubtable();
      expect(subtable1.format).toBe(12);
      const glyphMapping1 = subtable1.readGlyphMapping();
      expect(glyphMapping1.size).toBe(26);
      expect(glyphMapping1.get(0x41)).toBe(1);
      expect(glyphMapping1.get(0x5a)).toBe(26);

      const subtable2 = table.encodingRecords[1].readSubtable();
      expect(subtable2.format).toBe(12);
      const glyphMapping2 = subtable2.readGlyphMapping();
      expect(glyphMapping2.get(0x41)).toBe(1);
    });
  });

  describe('CmapTableBuilder', () => {
    it('writes format 12 subtables', () => {
      const writer = new DataWriter();
      const builder = new CmapTableBuilder();
      const groups = [
        { startCharCode: 0x20, endCharCode: 0x20, startGlyphID: 1 },
        { startCharCode: 0x41, endCharCode: 0x5a, startGlyphID: 2 },
      ];
      builder.addSubtable12(3, 10, groups);
      builder.addSubtable12(0, 4, groups);
      builder.writeTable(writer);

      const table = CmapTable.read(writer.getData());

      expect(table.encodingRecords).toHaveLength(2);
      const subtable = selectBestCmapSubtable(table);
      expect(subtable!.format).toBe(12);
      const glyphMapping = subtable!.readGlyphMapping();
      expect(glyphMapping.size).toBe(27);
      expect(glyphMapping.get(0x20)).toBe(1);
      expect(glyphMapping.get(0x41)).toBe(2);
      expect(glyphMapping.get(0x5a)).toBe(27);
    });

    it('writes table at non-zero offset', () => {
      const writer = new DataWriter();
      // Simulate font builder writing other tables first
      for (let i = 0; i < 100; i++) {
        writer.writeUint32(i);
      }
      const tableStart = writer.position; // offset 400

      const builder = new CmapTableBuilder();
      builder.addSubtable12(3, 10, [{ startCharCode: 0x48, endCharCode: 0x48, startGlyphID: 5 }]);
      builder.writeTable(writer);

      // Read back from the correct offset
      const cmapData = subDataView(writer.getData(), tableStart);
      const table = CmapTable.read(cmapData);
      const subtable = selectBestCmapSubtable(table);
      expect(subtable!.format).toBe(12);
      const glyphMapping = subtable!.readGlyphMapping();
      expect(glyphMapping.size).toBe(1);
      expect(glyphMapping.get(0x48)).toBe(5);
    });
  });
});
