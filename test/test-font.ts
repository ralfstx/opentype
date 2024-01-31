import { readFile } from 'node:fs/promises';

import { Font, readFont } from 'src/font.ts';
import { describe, expect, test } from 'vitest';
import z from 'zod';

const schema = z.object({
  tables: z.object({
    cmap: z
      .object({
        version: z.number(),
        subtables: z.array(
          z.object({
            platformID: z.number(),
            encodingID: z.number(),
            format: z.number(),
            glyphs: z.array(
              z.object({
                code: z.string(),
                glyphID: z.number(),
              })
            ),
          })
        ),
      })
      .optional(),
  }),
});

export type TestFontData = z.infer<typeof schema>;

export async function testFont(fontFile: string, testFontData: TestFontData) {
  const fontData = await readFile(fontFile);
  const font = readFont(fontData);

  for (const tableTag in testFontData.tables ?? {}) {
    if (tableTag === 'cmap') {
      testCmapTable(font, testFontData.tables[tableTag]);
    }
  }
}

function testCmapTable(font: Font, expectedCmap: TestFontData['tables']['cmap']) {
  test('table exists', () => {});

  describe('cmap', () => {
    const cmap = font.tables.cmap;

    test('table exists', () => {
      return expect(cmap).toBeDefined();
    });

    test('has correct number of subtables', () => {
      return expect(cmap.encodingRecords.length).toBe(expectedCmap?.subtables.length);
    });

    expectedCmap?.subtables.forEach((expectedSubtable, i) => {
      const encodingRecord = cmap.encodingRecords[i];

      describe(`subtable ${i}`, () => {
        test('can read subtable', () => {
          expect(() => {
            subtable = encodingRecord.readSubtable();
          }).not.toThrow();
        });

        let subtable = safe(() => encodingRecord.readSubtable());

        if (subtable) {
          test('has correct platformID and encodingID', () => {
            expect(encodingRecord.platformID).toBe(expectedSubtable.platformID);
            expect(encodingRecord.encodingID).toBe(expectedSubtable.encodingID);
          });

          test('has correct format', () => {
            expect(subtable!.format).toBe(expectedSubtable.format);
          });

          test('has correct glyph ids', () => {
            expectedSubtable.glyphs.forEach(({ code, glyphID }) => {
              expect(subtable!.lookupGlyphId(parseInt(code))).toBe(glyphID);
            });
          });
        }
      });
    });
  });
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    return undefined;
  }
}
