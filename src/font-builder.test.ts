import { FontBuilder } from 'src/font-builder.ts';
import { nameIDs, NameTableBuilder } from 'src/tables/name.ts';
import { toHexString } from 'test/utils.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { subDataView } from './data-reader.ts';
import { HeadTableBuilder } from './tables/head.ts';

describe('FontBuilder', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
  });

  it('writes font with two tables', () => {
    const font = new FontBuilder();
    const head = new HeadTableBuilder();
    font.addTable(head);
    const name = new NameTableBuilder();
    name.addName(nameIDs.fontFamilyName, 'FooBar', 'en-US');
    font.addTable(name);

    const result = font.build();

    // font file size
    expect(result.byteLength).toEqual(124);

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
        '22 81 9e f5', // checksum
        '00 00 00 2c', // offset: 44 (beginning of the 'head' table
        '00 00 00 30', // length: 48 bytes
      ].join(' '),
    );
    // checksum matches head table data with checksumAdjustment zeroed out
    const headTableData = result.buffer.slice(44, 44 + 48);
    new Uint8Array(headTableData).set([0, 0, 0, 0], 8);
    expect(calculateChecksum(new DataView(headTableData))).toEqual(0x22819ef5);

    // name table record
    expect(toHexString(subDataView(result, 28, 16))).toEqual(
      [
        '6e 61 6d 65', // tag: "name"
        '01 37 05 2f', // checksum
        '00 00 00 5c', // offset: 92 (beginning of the 'name' table)
        '00 00 00 20', // length: 32 bytes
      ].join(' '),
    );
    // checksum matches name table data
    expect(calculateChecksum(subDataView(result, 92, 32))).toEqual(0x0137052f);

    // beginning of head table
    expect(toHexString(subDataView(result, 44, 16))).toEqual(
      [
        '00 01 00 00', // majorVersion: 1, minorVersion: 0
        '00 00 00 00', // fontRevision (ok, though 0)
        '93 74 97 b1', // checksumAdjustment
        '5f 0f 3c f5', // magicNumber
      ].join(' '),
    );

    // beginning of name table
    expect(toHexString(subDataView(result, 92, 6))).toEqual(
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
