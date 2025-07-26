import { fromHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

import { DataWriter } from '../data-writer.ts';
import { type HheaTable } from '../tables/hhea.ts';
import { HmtxTable, HmtxTableBuilder } from '../tables/hmtx.ts';
import { type MaxpTable } from '../tables/maxp.ts';

describe('HmtxTable', () => {
  describe('read', () => {
    test('reads hMetrics', () => {
      const data = fromHexString(
        '00 01 00 02', // advanceWidth, leftSideBearing
        '00 03 00 04', // advanceWidth, leftSideBearing
        '00 05 00 06', // advanceWidth, leftSideBearing
      );

      const table = HmtxTable.read(
        data,
        { numberOfHMetrics: 3 } as HheaTable,
        { numGlyphs: 3 } as MaxpTable,
      );

      expect(table.hMetrics).toEqual([
        { advanceWidth: 1, leftSideBearing: 2 },
        { advanceWidth: 3, leftSideBearing: 4 },
        { advanceWidth: 5, leftSideBearing: 6 },
      ]);
    });

    test('reads leftSideBearings', () => {
      const data = fromHexString(
        '00 01 00 02', // advanceWidth, leftSideBearing
        '00 03 00 04', // advanceWidth, leftSideBearing
        '00 05 00 06', // advanceWidth, leftSideBearing
        '00 07', // leftSideBearing
        '00 08', // leftSideBearing
        '00 09', // leftSideBearing
      );

      const table = HmtxTable.read(
        data,
        { numberOfHMetrics: 3 } as HheaTable,
        { numGlyphs: 6 } as MaxpTable,
      );

      expect(table.hMetrics).toEqual([
        { advanceWidth: 1, leftSideBearing: 2 },
        { advanceWidth: 3, leftSideBearing: 4 },
        { advanceWidth: 5, leftSideBearing: 6 },
      ]);
      expect(table.leftSideBearings).toEqual([7, 8, 9]);
    });
  });
});

describe('HmtxTableBuilder', () => {
  test('writes hMetrics only', () => {
    const writer = new DataWriter();

    const builder = new HmtxTableBuilder();
    builder.hMetrics.push({ advanceWidth: 1, leftSideBearing: 2 });
    builder.hMetrics.push({ advanceWidth: 3, leftSideBearing: 4 });
    builder.hMetrics.push({ advanceWidth: 5, leftSideBearing: 6 });
    builder.writeTable(writer);

    expect(writer.getData()).toEqual(
      fromHexString(
        '00 01 00 02', // advanceWidth, leftSideBearing
        '00 03 00 04', // advanceWidth, leftSideBearing
        '00 05 00 06', // advanceWidth, leftSideBearing
      ),
    );
  });

  test('writes hMetrics and leftSideBearing', () => {
    const writer = new DataWriter();

    const builder = new HmtxTableBuilder();
    builder.hMetrics.push({ advanceWidth: 1, leftSideBearing: 2 });
    builder.hMetrics.push({ advanceWidth: 3, leftSideBearing: 4 });
    builder.hMetrics.push({ advanceWidth: 5, leftSideBearing: 6 });
    builder.leftSideBearings.push(7);
    builder.leftSideBearings.push(8);
    builder.leftSideBearings.push(9);
    builder.writeTable(writer);

    expect(writer.getData()).toEqual(
      fromHexString(
        '00 01 00 02', // advanceWidth, leftSideBearing
        '00 03 00 04', // advanceWidth, leftSideBearing
        '00 05 00 06', // advanceWidth, leftSideBearing
        '00 07', // leftSideBearing
        '00 08', // leftSideBearing
        '00 09', // leftSideBearing
      ),
    );
  });

  test('writes hmtx table', () => {
    const writer = new DataWriter();
    const table = {
      hMetrics: [
        { advanceWidth: 1, leftSideBearing: 2 },
        { advanceWidth: 3, leftSideBearing: 4 },
        { advanceWidth: 5, leftSideBearing: 6 },
      ],
      leftSideBearings: [7, 8, 9],
    } as HmtxTable;

    const builder = new HmtxTableBuilder(table);
    builder.writeTable(writer);

    expect(writer.getData()).toEqual(
      fromHexString(
        '00 01 00 02', // advanceWidth, leftSideBearing
        '00 03 00 04', // advanceWidth, leftSideBearing
        '00 05 00 06', // advanceWidth, leftSideBearing
        '00 07', // leftSideBearing
        '00 08', // leftSideBearing
        '00 09', // leftSideBearing
      ),
    );
  });
});
