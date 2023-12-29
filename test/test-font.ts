import { readFile } from 'node:fs/promises';

import { Font } from 'src/font.js';
import { readFont } from 'src/otf.js';
import { describe, expect, test } from 'vitest';

export type TestData = any;

export async function testFont(fontFile: string, testData: TestData) {
  const fontData = await readFile(fontFile);
  const font = readFont(fontData);

  for (const tableTag in testData.tables ?? {}) {
    if (tableTag === 'cmap') {
      testCmapTable(font, testData.tables[tableTag]);
    }
  }
}

function testCmapTable(font: Font, expectedTable: any) {
  console.log('testCmapTable');

  test('table exists', () => {});

  describe('cmap', () => {
    const cmap = font.tables.cmap;

    test('table exists', () => {
      return expect(cmap).toBeDefined();
    });

    test('has correct number of subtables', () => {
      return expect(cmap.encodingRecords.length).toBe(expectedTable.subtables.length);
    });

    expectedTable.subtables.forEach((expectedSubtable, i) => {
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
