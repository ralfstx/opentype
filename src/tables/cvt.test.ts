import { DataWriter } from 'src/data-writer.ts';
import { CvtTable, CvtTableBuilder } from 'src/tables/cvt.ts';
import { fromHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('CvtTable', () => {
  describe('read', () => {
    test('reads values', () => {
      const data = fromHexString('00 01', '00 02', '00 03', '00 04', '00 05');

      const table = CvtTable.read(data);

      expect(table.values).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

describe('CvtTableBuilder', () => {
  test('writes values', () => {
    const writer = new DataWriter();

    const builder = new CvtTableBuilder();
    builder.values.push(1, 2, 3, 4, 5);
    builder.writeTable(writer);

    expect(writer.getData()).toEqual(fromHexString('00 01', '00 02', '00 03', '00 04', '00 05'));
  });
});
