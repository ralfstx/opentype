import { FontBuilder } from 'src/font-builder.ts';
import { nameIDs, NameTableBuilder } from 'src/tables/name.ts';
import { describe, expect, test } from 'vitest';

describe('FontBuilder', () => {
  test('writes empty font', () => {
    const builder = new FontBuilder();

    const result = builder.build();

    expect(new Uint8Array(result.buffer)).toEqual(
      new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    );
  });

  test('writes font with a table', () => {
    const font = new FontBuilder();
    const name = new NameTableBuilder();
    name.addName(nameIDs.fontFamilyName, 'FooBar', 'en-US');
    font.addTable(name);

    const result = font.build();

    expect(new Uint8Array(result.buffer)).toEqual(
      new Uint8Array([
        0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 15, 110, 97, 109, 101, 110, 99, 109, 117, 0, 0, 0, 28, 0,
        0, 0, 30,
      ]),
    );
  });
});
