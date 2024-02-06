import { DataWriter } from 'src/data-writer.ts';
import { MaxpTableBuilder } from 'src/tables/maxp-builder.ts';
import { toHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('MaxpTableBuilder', () => {
  test('writes table version 0.5', () => {
    const builder = new MaxpTableBuilder();
    builder.numGlyphs = 255;

    const writer = new DataWriter();
    builder.writeTable(writer);
    const result = writer.getData();

    expect(toHexString(result)).toEqual(
      [
        '00 00 50 00', // version 0.5
        '00 ff', // numGlyphs
      ].join(' ')
    );
  });

  test('writes table version 1.0', () => {
    const builder = new MaxpTableBuilder();
    builder.numGlyphs = 255;
    builder.maxPoints = 23;

    const writer = new DataWriter();
    builder.writeTable(writer);
    const result = writer.getData();

    expect(toHexString(result)).toEqual(
      [
        '00 01 00 00', // version 1.0
        '00 ff', // numGlyphs
        '00 17', // maxPoints
        '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00',
      ].join(' ')
    );
  });
});
