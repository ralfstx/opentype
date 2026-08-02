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

  it('writes a single cmap subtable', () => {
    const glyphIds = [...'Hello World'].map((char) => font.glyphMapping.get(char.codePointAt(0)!)!);

    const { fontData } = createSubset(font, glyphIds);

    const cmap = Font.fromData(fontData).tables.cmap!;
    expect(cmap.encodingRecords).toHaveLength(1);
    expect(cmap.encodingRecords[0]).toMatchObject({ platformID: 3, encodingID: 10 });
  });

  it('maps all requested code points to their subset glyph IDs', () => {
    const codePoints = [...'Hello World'].map((char) => char.codePointAt(0)!);
    const glyphIds = codePoints.map((codePoint) => font.glyphMapping.get(codePoint)!);

    const { fontData, glyphIdMapping } = createSubset(font, glyphIds);

    const subsetMapping = Font.fromData(fontData).glyphMapping;
    for (const codePoint of codePoints) {
      expect(subsetMapping.get(codePoint)).toBe(glyphIdMapping.get(font.glyphMapping.get(codePoint)!));
    }
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
