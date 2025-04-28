import { FontBuilder } from 'src/font-builder.ts';
import { nameIDs, NameTableBuilder } from 'src/tables/name.ts';
import { toHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('FontBuilder', () => {
  test('writes font with a table', () => {
    const font = new FontBuilder();
    const name = new NameTableBuilder();
    name.addName(nameIDs.fontFamilyName, 'FooBar', 'en-US');
    font.addTable(name);

    const result = font.build();

    expect(toHexString(result)).toEqual(
      [
        '00 01 00 00 00 01 00 01 00 00 00 0f 6e 61 6d 65',
        '6e 63 6d 75 00 00 00 1c 00 00 00 1e 00 00 00 01',
        '00 12 00 03 00 01 04 09 00 01 00 0c 00 00 00 46',
        '00 6f 00 6f 00 42 00 61 00 72',
      ].join(' '),
    );
  });
});
