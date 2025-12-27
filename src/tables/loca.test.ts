import { describe, expect, it } from 'vitest';

import { DataWriter } from '../data-writer.ts';
import { type HeadTable } from '../tables/head.ts';
import { LocaTable, LocaTableBuilder } from '../tables/loca.ts';
import { type MaxpTable } from '../tables/maxp.ts';
import { fromHexString, toHexString } from '../test-utils.ts';

describe('LocaTable', () => {
  describe('read', () => {
    it('reads short format', () => {
      const data = fromHexString('00 00', '00 32', '00 64');

      const table = LocaTable.read(
        data,
        { indexToLocFormat: 0 } as HeadTable,
        { numGlyphs: 2 } as MaxpTable,
      );

      expect(table.offsets).toEqual([0, 100, 200]);
    });

    it('reads log format', () => {
      const data = fromHexString('00 00 00 00', '00 00 00 64', '00 00 00 c8');
      const table = LocaTable.read(
        data,
        { indexToLocFormat: 1 } as HeadTable,
        { numGlyphs: 2 } as MaxpTable,
      );

      expect(table.offsets).toEqual([0, 100, 200]);
    });
  });
});

describe('LocaTableBuilder', () => {
  it('writes short format', () => {
    const writer = new DataWriter();

    const builder = LocaTableBuilder.shortFormat();
    builder.offsets.push(0, 100, 200, 300);
    builder.writeTable(writer);

    // Offsets are divided by 2 in short format.
    // 0/2=0, 100/2=50 (0x32), 200/2=100 (0x64), 300/2=150 (0x96)
    expect(toHexString(writer.getData())).toEqual(['00 00', '00 32', '00 64', '00 96'].join(' '));
  });

  it('round-trips short format offsets', () => {
    const originalOffsets = [0, 100, 250, 500, 1000];

    const writer = new DataWriter();
    const builder = LocaTableBuilder.shortFormat();
    builder.offsets.push(...originalOffsets);
    builder.writeTable(writer);

    const table = LocaTable.read(
      writer.getData(),
      { indexToLocFormat: 0 } as HeadTable,
      { numGlyphs: originalOffsets.length - 1 } as MaxpTable,
    );

    expect(table.offsets).toEqual(originalOffsets);
  });

  it('writes long format', () => {
    const writer = new DataWriter();

    const builder = LocaTableBuilder.longFormat();
    builder.offsets.push(0, 100, 200, 300);
    builder.writeTable(writer);

    // Offsets are written as-is in long format.
    // 0=0x00000000, 100=0x00000064, 200=0x000000c8, 300=0x0000012c
    expect(toHexString(writer.getData())).toEqual(
      ['00 00 00 00', '00 00 00 64', '00 00 00 c8', '00 00 01 2c'].join(' '),
    );
  });

  it('round-trips long format offsets', () => {
    const originalOffsets = [0, 100, 250, 500, 1000];

    const writer = new DataWriter();
    const builder = LocaTableBuilder.longFormat();
    builder.offsets.push(...originalOffsets);
    builder.writeTable(writer);

    const table = LocaTable.read(
      writer.getData(),
      { indexToLocFormat: 1 } as HeadTable,
      { numGlyphs: originalOffsets.length - 1 } as MaxpTable,
    );

    expect(table.offsets).toEqual(originalOffsets);
  });

  it('chooses short format', () => {
    const builder = LocaTableBuilder.forOffsets([0, 20, 40]);

    expect(builder.format).toBe('short');
    expect(builder.offsets).toEqual([0, 20, 40]);
  });

  it('chooses long format', () => {
    const builder = LocaTableBuilder.forOffsets([0, 20, 80_000]);

    expect(builder.format).toBe('long');
    expect(builder.offsets).toEqual([0, 20, 80_000]);
  });
});
