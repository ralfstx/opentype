import { describe, expect, it } from 'vitest';

import { fromHexString } from '../../test/utils.ts';
import { DataReader } from '../data-reader.ts';
import { DataWriter } from '../data-writer.ts';
import { nameIDs, NameTable, NameTableBuilder } from '../tables/name.ts';

describe('NameTable', () => {
  describe('read', () => {
    it('reads a name table', () => {
      const data = fromHexString(
        '00 00', // version
        '00 02', // count
        '00 1e', // storageOffset = 30
        '00 03', // platformID
        '00 01', // encodingID
        '04 09', // languageID
        '00 04', // nameID
        '00 0a', // length = 10
        '00 00', // stringOffset = 0
        '00 03', // platformID
        '00 01', // encodingID
        '04 09', // languageID
        '00 00', // nameID
        '00 0a', // length = 10
        '00 0a', // stringOffset = 10
        '00 74 00 65 00 73 00 74 00 31', // 'test1'
        '00 74 00 65 00 73 00 74 00 32', // 'test2'
      );

      const table = NameTable.read(data);

      expect(table.version).toBe(0);
      expect(table.storageOffset).toBe(30);
      expect(table.nameRecords.length).toBe(2);
      expect(table.findName(nameIDs.fullFontName)).toEqual({
        name: 'test1',
        language: 'en-US',
      });
      expect(table.findName(nameIDs.copyrightNotice)).toEqual({
        name: 'test2',
        language: 'en-US',
      });
    });
  });
});

describe('NameTableBuilder', () => {
  it('writes table', () => {
    const nameTable = new NameTableBuilder();
    nameTable.addName(nameIDs.fullFontName, 'test1', 'en-US');
    nameTable.addName(nameIDs.copyrightNotice, 'test2', 'en-US');

    const writer = new DataWriter();
    nameTable.writeTable(writer);
    const data = writer.getData();

    const reader = new DataReader(data);
    expect(reader.readUint16()).toBe(0); // version
    expect(reader.readUint16()).toBe(2); // count
    expect(reader.readUint16()).toBe(30); // storageOffset
    expect(reader.readUint16()).toBe(3); // platformID
    expect(reader.readUint16()).toBe(1); // encodingID
    expect(reader.readUint16()).toBe(0x0409); // languageID
    expect(reader.readUint16()).toBe(4); // nameID
    expect(reader.readUint16()).toBe(10); // length
    expect(reader.readUint16()).toBe(0); // stringOffset
    expect(reader.readUint16()).toBe(3); // platformID
    expect(reader.readUint16()).toBe(1); // encodingID
    expect(reader.readUint16()).toBe(0x0409); // languageID
    expect(reader.readUint16()).toBe(0); // nameID
    expect(reader.readUint16()).toBe(10); // length
    expect(reader.readUint16()).toBe(10); // stringOffset
    expect(reader.readUtf16BE(10)).toBe('test1');
    expect(reader.readUtf16BE(10)).toBe('test2');
  });
});
