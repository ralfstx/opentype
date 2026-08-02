import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { Font } from './font.ts';
import { createSubset } from './subset.ts';

describe('createSubset', () => {
  let font: Font;

  beforeAll(async () => {
    const fileName = new URL('../fonts/gentium/Gentium-Regular.ttf', import.meta.url).pathname;
    const fontData = await readFile(fileName);
    font = Font.fromData(fontData);
  });

  it('returns font data without trailing slack from the write buffer', () => {
    const glyphIds = [...'Hello World'].map((char) => font.glyphMapping.get(char.codePointAt(0)!)!);

    const { fontData } = createSubset(font, glyphIds);

    const subset = Font.fromData(fontData);
    const end = Math.max(...subset.tableRecords.map((record) => record.offset + record.length));
    expect(fontData.byteLength).toBe(end + ((4 - (end % 4)) % 4));
  });

  it('returns font data that can be parsed again', () => {
    const glyphIds = [...'Hello World'].map((char) => font.glyphMapping.get(char.codePointAt(0)!)!);

    const { fontData, glyphIdMapping } = createSubset(font, glyphIds);

    const subset = Font.fromData(fontData);
    expect(subset.type).toBe('TrueType');
    for (const [originalId, subsetId] of glyphIdMapping) {
      expect(subset.tables.glyf?.readGlyph(subsetId)).toEqual(font.tables.glyf?.readGlyph(originalId));
    }
  });
});
