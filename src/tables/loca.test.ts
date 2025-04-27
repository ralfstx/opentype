import { DataWriter } from 'src/data-writer.ts';
import { type HeadTable } from 'src/tables/head.ts';
import { LocaTable, LocaTableBuilder } from 'src/tables/loca.ts';
import { type MaxpTable } from 'src/tables/maxp.ts';
import { fromHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('LocaTable', () => {
  describe('read', () => {
    test('reads short format', () => {
      const data = fromHexString('00 00', '00 01', '00 02');

      const table = LocaTable.read(
        data,
        { indexToLocFormat: 0 } as HeadTable,
        { numGlyphs: 2 } as MaxpTable,
      );

      expect(table.offsets).toEqual([0, 2, 4]);
    });

    test('reads log format', () => {
      const data = fromHexString('00 00 00 00', '00 00 00 01', '00 00 00 02');

      const table = LocaTable.read(
        data,
        { indexToLocFormat: 1 } as HeadTable,
        { numGlyphs: 2 } as MaxpTable,
      );

      expect(table.offsets).toEqual([0, 1, 2]);
    });
  });
});

describe('LocaTableBuilder', () => {
  test('writes short format', () => {
    const writer = new DataWriter();

    const builder = LocaTableBuilder.shortFormat();
    builder.offsets.push(0, 2, 4);
    builder.writeTable(writer);

    expect(writer.data).toEqual(fromHexString('00 00', '00 01', '00 02'));
  });

  test('writes long format', () => {
    const writer = new DataWriter();

    const builder = LocaTableBuilder.longFormat();
    builder.offsets.push(0, 1, 2);
    builder.writeTable(writer);

    expect(writer.data).toEqual(fromHexString('00 00 00 00', '00 00 00 01', '00 00 00 02'));
  });

  test('chooses short format', () => {
    const builder = LocaTableBuilder.forOffsets([0, 20, 40]);

    expect(builder.format).toBe('short');
    expect(builder.offsets).toEqual([0, 20, 40]);
  });

  test('chooses long format', () => {
    const builder = LocaTableBuilder.forOffsets([0, 20, 80_000]);

    expect(builder.format).toBe('long');
    expect(builder.offsets).toEqual([0, 20, 80_000]);
  });
});
