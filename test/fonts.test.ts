import { fail } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';

import { Font } from 'src/font.ts';
import { readFont } from 'src/otf.ts';
import { describe, expect, test } from 'vitest';
import YAML from 'yaml';

describe('test-fonts', async () => {
  const files = await readdir('test/cmap');
  for (const file of files) {
    if (file.endsWith('.otf')) {
      const hasYaml = files.includes(file.replace('.otf', '.yaml'));

      if (hasYaml) {
        const fontData = await readFile('test/cmap/' + file);
        const testData = await readYamlFile('test/cmap/' + file.replace('.otf', '.yaml'));
        try {
          const font = readFont(fontData);

          describe(file, () => {
            testFont(font, testData);
          });
        } catch (error) {
          fail('Cannot read ' + file + ': ' + error);
        }
      }
    }
  }
});

function testFont(font: Font, testData: any) {
  for (const tableTag in testData.tables ?? {}) {
    if (tableTag === 'maxp') {
      testMaxpTable(font, testData.tables[tableTag]);
    }
    if (tableTag === 'cmap') {
      testCmapTable(font, testData.tables[tableTag]);
    }
  }
}

function testMaxpTable(font: Font, expectedTable: any) {
  describe('maxp', () => {
    const maxp = font.tables.maxp;

    test('table exists', () => {
      return expect(maxp).toBeDefined();
    });

    test('has correct numGlyphs', () => {
      return expect(maxp.numGlyphs).toBe(expectedTable.numGlyphs);
    });
  });
}

function testCmapTable(font: Font, expectedTable: any) {
  describe('cmap', () => {
    const cmap = font.tables.cmap;

    test('table exists', () => {
      return expect(cmap).toBeDefined();
    });

    test('has correct number of subtables', () => {
      return expect(cmap.encodingRecords.length).toBe(expectedTable.subtables.length);
    });

    expectedTable.subtables.forEach((expectedSubtable: any, i: number) => {
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

          if (expectedSubtable.glyphs?.length) {
            test('has correct glyph ids', () => {
              expectedSubtable.glyphs.forEach(({ code, glyphID }: any) => {
                expect([code, subtable!.lookupGlyphId(parseInt(code))]).toEqual([code, glyphID]);
              });
            });
          }
        }
      });
    });
  });
}

async function readYamlFile(path: string) {
  const content = await readFile(path, { encoding: 'utf8' });
  return YAML.parse(content);
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    return undefined;
  }
}
