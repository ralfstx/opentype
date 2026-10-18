import { describe, expect, it } from 'vitest';

import { DataWriter } from '../data-writer.ts';
import { type HheaTable } from '../tables/hhea.ts';
import { HmtxTable, HmtxTableBuilder } from '../tables/hmtx.ts';
import { type MaxpTable } from '../tables/maxp.ts';
import { fromHexString } from '../test-utils.ts';

describe('HmtxTable', () => {
  describe('read', () => {
    it('reads hMetrics', () => {
      const data = fromHexString(
        '00 01 00 02', // advanceWidth, leftSideBearing
        '00 03 00 04', // advanceWidth, leftSideBearing
        '00 05 00 06', // advanceWidth, leftSideBearing
      );

      const table = HmtxTable.read(data, { numberOfHMetrics: 3 } as HheaTable, { numGlyphs: 3 } as MaxpTable);

      expect(table.hMetrics).toEqual([
        { advanceWidth: 1, leftSideBearing: 2 },
        { advanceWidth: 3, leftSideBearing: 4 },
        { advanceWidth: 5, leftSideBearing: 6 },
      ]);
    });

    it('reads leftSideBearings', () => {
      const data = fromHexString(
        '00 01 00 02', // advanceWidth, leftSideBearing
        '00 03 00 04', // advanceWidth, leftSideBearing
        '00 05 00 06', // advanceWidth, leftSideBearing
        '00 07', // leftSideBearing
        '00 08', // leftSideBearing
        '00 09', // leftSideBearing
      );

      const table = HmtxTable.read(data, { numberOfHMetrics: 3 } as HheaTable, { numGlyphs: 6 } as MaxpTable);

      expect(table.hMetrics).toEqual([
        { advanceWidth: 1, leftSideBearing: 2 },
        { advanceWidth: 3, leftSideBearing: 4 },
        { advanceWidth: 5, leftSideBearing: 6 },
      ]);
      expect(table.leftSideBearings).toEqual([7, 8, 9]);
    });
  });

  describe('getMetric', () => {
    const data = fromHexString(
      '00 01 00 02', // advanceWidth, leftSideBearing
      '00 03 00 04', // advanceWidth, leftSideBearing
      '00 07', // leftSideBearing
      '00 08', // leftSideBearing
    );
    const table = HmtxTable.read(data, { numberOfHMetrics: 2 } as HheaTable, { numGlyphs: 4 } as MaxpTable);

    it('returns the metric of a glyph with its own entry', () => {
      expect(table.getMetric(1)).toEqual({ advanceWidth: 3, leftSideBearing: 4 });
    });

    it('returns the last advance width for glyphs beyond the entries', () => {
      expect(table.getMetric(2)).toEqual({ advanceWidth: 3, leftSideBearing: 7 });
      expect(table.getMetric(3)).toEqual({ advanceWidth: 3, leftSideBearing: 8 });
    });

    it('returns undefined for glyphs that do not exist', () => {
      expect(table.getMetric(4)).toBeUndefined();
    });
  });
});

describe('HmtxTableBuilder', () => {
  it('writes hMetrics only', () => {
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

  it('writes hMetrics and leftSideBearing', () => {
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

  it('writes hmtx table', () => {
    const writer = new DataWriter();
    const table = {
      hMetrics: [
        { advanceWidth: 1, leftSideBearing: 2 },
        { advanceWidth: 3, leftSideBearing: 4 },
        { advanceWidth: 5, leftSideBearing: 6 },
      ],
      leftSideBearings: [7, 8, 9],
    };

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
