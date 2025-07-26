import { describe, expect, test } from 'vitest';

import { DataReader } from '../data-reader.ts';
import { DataWriter } from '../data-writer.ts';
import { nameIDs, NameTable, NameTableBuilder } from '../tables/name.ts';

describe('NameTable', () => {
  test('reads table', () => {
    const writer = new DataWriter();
    writer.writeUint16(0); // version
    writer.writeUint16(2); // count
    writer.writeUint16(30); // storageOffset
    writer.writeUint16(3); // platformID
    writer.writeUint16(1); // encodingID
    writer.writeUint16(0x0409); // languageID
    writer.writeUint16(4); // nameID
    writer.writeUint16(10); // length
    writer.writeUint16(0); // stringOffset
    writer.writeUint16(3); // platformID
    writer.writeUint16(1); // encodingID
    writer.writeUint16(0x0409); // languageID
    writer.writeUint16(0); // nameID
    writer.writeUint16(10); // length
    writer.writeUint16(10); // stringOffset
    writer.writeUtf16BE('test1');
    writer.writeUtf16BE('test2');
    const data = writer.getData();

    const table = NameTable.read(data);

    expect(table.version).toBe(0);
    expect(table.findName(nameIDs.fullFontName)).toEqual({
      string: 'test1',
      language: 'en-US',
    });
    expect(table.findName(nameIDs.fullFontName, 'en-US')).toEqual({
      string: 'test1',
      language: 'en-US',
    });
    expect(table.findName(nameIDs.fullFontName, 'de-DE')).toEqual({
      string: 'test1',
      language: 'en-US',
    });
    expect(table.findName(nameIDs.copyrightNotice)).toEqual({
      string: 'test2',
      language: 'en-US',
    });
    expect(table.findName(nameIDs.copyrightNotice, 'en-US')).toEqual({
      string: 'test2',
      language: 'en-US',
    });
  });
});

describe('NameTableBuilder', () => {
  test('writes table', () => {
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
