import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { describe, expect, test } from 'vitest';

import { nameIDs, NameTableWriter } from './name.ts';

describe('NameTableBuilder', () => {
  test('writes table', () => {
    const nameTable = new NameTableWriter();
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
