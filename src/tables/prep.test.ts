import { DataWriter } from 'src/data-writer.ts';
import { PrepTable, PrepTableBuilder } from 'src/tables/prep.ts';
import { fromHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('PrepTable', () => {
  describe('read', () => {
    test('reads instructions', () => {
      const data = fromHexString('01', '02', '03', '04', '05');

      const table = PrepTable.read(data);

      expect(table.instructions).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

describe('PrepTableBuilder', () => {
  test('writes instructions', () => {
    const writer = new DataWriter();

    const builder = new PrepTableBuilder();
    builder.instructions.push(1, 2, 3, 4, 5);
    builder.writeTable(writer);

    expect(writer.data).toEqual(fromHexString('01', '02', '03', '04', '05'));
  });
});
