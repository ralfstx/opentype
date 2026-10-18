import { beforeEach, describe, expect, it, vi } from 'vitest';

import { subDataView } from './data-reader.ts';
import { FontBuilder } from './font-builder.ts';
import { Font } from './index.ts';
import { RawTableBuilder } from './table-builder.ts';
import { GlyfTableBuilder, readGlyph } from './tables/glyf.ts';
import { HeadTableBuilder } from './tables/head.ts';
import { NameIDs, NameTableBuilder } from './tables/name.ts';
import { fromHexString, toHexString } from './test-utils.ts';

describe('FontBuilder', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
  });

  it('writes font with two tables', () => {
    const font = new FontBuilder();
    const head = new HeadTableBuilder();
    font.addTable(head);
    const name = new NameTableBuilder();
    name.addName(NameIDs.fontFamilyName, 'FooBar', 'en-US');
    font.addTable(name);

    const result = font.build();

    // font file size
    expect(result.byteLength).toEqual(132);

    // font header
    expect(toHexString(subDataView(result, 0, 12))).toEqual(
      [
        '00 01 00 00', // sfnt version
        '00 02', //	numTables = 2
        '00 20', // searchRange (power of two × 16)
        '00 01', // entrySelector (log2 of largest power of two ≤ numTables)
        '00 00', // rangeShift
      ].join(' '),
    );

    // head table record
    expect(toHexString(subDataView(result, 12, 16))).toEqual(
      [
        '68 65 61 64', // tag: "head"
        '22 81 9e f5', // checksum (includes padding bytes)
        '00 00 00 2c', // offset: 44 (beginning of the 'head' table)
        '00 00 00 36', // length: 54 bytes (padded to 56 for alignment)
      ].join(' '),
    );
    // checksum matches head table data with checksumAdjustment zeroed out
    const headTableData = result.buffer.slice(44, 44 + 56);
    new Uint8Array(headTableData).set([0, 0, 0, 0], 8);
    expect(calculateChecksum(new DataView(headTableData))).toEqual(0x22819ef5);

    // name table record
    expect(toHexString(subDataView(result, 28, 16))).toEqual(
      [
        '6e 61 6d 65', // tag: "name"
        '01 37 05 2f', // checksum
        '00 00 00 64', // offset: 100 (beginning of the 'name' table)
        '00 00 00 1e', // length: 30 bytes (padded to 32 for alignment)
      ].join(' '),
    );
    // checksum matches name table data (including padding)
    expect(calculateChecksum(subDataView(result, 100, 32))).toEqual(0x0137052f);

    // beginning of head table
    expect(toHexString(subDataView(result, 44, 16))).toEqual(
      [
        '00 01 00 00', // majorVersion: 1, minorVersion: 0
        '00 00 00 00', // fontRevision (ok, though 0)
        '93 74 97 a5', // checksumAdjustment
        '5f 0f 3c f5', // magicNumber
      ].join(' '),
    );

    // beginning of name table
    expect(toHexString(subDataView(result, 100, 6))).toEqual(
      [
        '00 00', // version = 0
        '00 01', // count of name records = 1
        '00 12', // stringOffset = 18
      ].join(' '),
    );

    // checksum of the font data = 0xB1B0AFBA
    const checksum = calculateChecksum(result);
    expect(checksum).toEqual(0xb1b0afba);
  });

  it('writes table lengths without padding', () => {
    // The head table is 54 bytes, which requires 2 bytes padding for 4-byte alignment.
    // The table record's length field should be 54, not 56.
    const font = new FontBuilder();
    const head = new HeadTableBuilder();
    font.addTable(head);
    const name = new NameTableBuilder();
    name.addName(NameIDs.fontFamilyName, 'Test', 'en-US');
    font.addTable(name);

    const result = font.build();

    // Read the head table length from the table record (offset 12 + 12 = 24 for length field)
    const headLength = result.getUint32(12 + 12);
    expect(headLength).toBe(54); // actual table size, not padded

    // Read the name table length from the table record (offset 28 + 12 = 40 for length field)
    const nameLength = result.getUint32(28 + 12);
    // name table: 6 (header) + 12 (name record) + 8 ("Test" as UTF-16BE) = 26 bytes
    expect(nameLength).toBe(26); // actual table size, not padded to 28
  });

  it('writes table records sorted by tag', () => {
    const font = new FontBuilder();
    font.addTable(new HeadTableBuilder());
    font.addTable(new RawTableBuilder('prep', fromHexString('01 02 03 04')));
    font.addTable(new RawTableBuilder('cvt ', fromHexString('05 06 07 08')));

    const data = font.build();

    // Table data is written in the order head, prep, cvt
    const recordTags = [0, 1, 2].map((index) => toAscii(subDataView(data, 12 + index * 16, 4)));
    expect(recordTags).toEqual(['cvt ', 'head', 'prep']);
    const result = Font.fromData(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    expect(toHexString(result.tables.getTableData('prep')!)).toBe('01 02 03 04');
    expect(toHexString(result.tables.getTableData('cvt ')!)).toBe('05 06 07 08');
  });

  it('throws error when head table is missing', () => {
    const builder = new FontBuilder();

    expect(() => builder.build()).toThrowError('No head table present');
  });

  it('includes loca and maxp tables when glyf table is present', () => {
    const font = new FontBuilder();
    font.addTable(new HeadTableBuilder());
    font.addTable(new GlyfTableBuilder([createGlyph()]));

    const result = Font.fromData(new Uint8Array(font.build().buffer));

    expect(result.tables.loca).toBeDefined();
    expect(result.tables.loca?.offsets).toEqual([0, 20]);
    expect(result.tables.maxp).toBeDefined();
    expect(result.tables.maxp?.numGlyphs).toBe(1);
  });
});

function calculateChecksum(data: DataView): number {
  if (data.byteLength % 4 !== 0) {
    throw new Error('Data length must be a multiple of 4');
  }
  let sum = 0;
  for (let i = 0; i < data.byteLength; i += 4) {
    sum = (sum + data.getUint32(i)) >>> 0;
  }
  return sum;
}

function createGlyph() {
  return readGlyph(
    fromHexString(
      '00 01', // numberOfContours = 1 (simple)
      '00 00 00 00 00 64 00 64', // xMin=0, yMin=0, xMax=100, yMax=100
      '00 00', // endPtsOfContours = [0]
      '00 00', // instructionLength = 0
      '06', // flags
      '32 32', // x=50, y=50
    ),
  );
}

function toAscii(data: DataView): string {
  return String.fromCharCode(...new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}
