import { DataWriter } from 'src/data-writer.ts';
import { describe, expect, test } from 'vitest';

import { nameIDs, NameTable } from './name.ts';

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

    const table = new NameTable(data);

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
