import { DataWriter } from 'src/data-writer.ts';
import { FpgmTable, FpgmTableBuilder } from 'src/tables/fpgm.ts';
import { fromHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('FpgmTable', () => {
  describe('read', () => {
    test('reads instructions', () => {
      const data = fromHexString('01', '02', '03', '04', '05');

      const table = FpgmTable.read(data);

      expect(table.instructions).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

describe('FpgmTableBuilder', () => {
  test('writes instructions', () => {
    const writer = new DataWriter();

    const builder = new FpgmTableBuilder();
    builder.instructions.push(1, 2, 3, 4, 5);
    builder.writeTable(writer);

    expect(writer.data).toEqual(fromHexString('01', '02', '03', '04', '05'));
  });
});
