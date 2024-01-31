import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { readFont } from 'src/font.ts';

main();

async function main() {
  const args = process.argv.slice(2);
  for (const path of args) {
    const files = await findFiles(path, (name) => name.endsWith('.otf') || name.endsWith('.ttf'));

    const tables: Record<string, number> = {};
    const cmapSubtables: Record<string, number> = {};
    const nameRecords: Record<string, number> = {};

    for (const file of files) {
      try {
        console.log('reading ' + file);
        const data = await readFile(file);
        const font = readFont(data);
        font.tableRecords
          .map((rec) => rec.tableTag)
          .forEach((tag) => {
            tables[tag] ??= 0;
            tables[tag]++;
          });
        font.tables.cmap.encodingRecords.forEach((rec) => {
          const subtable = rec.readSubtable();
          cmapSubtables[rec.platformID + ' ' + rec.encodingID + ' ' + subtable.format] ??= 0;
          cmapSubtables[rec.platformID + ' ' + rec.encodingID + ' ' + subtable.format]++;
        });
        font.tables.name.nameRecords.forEach((rec) => {
          nameRecords[rec.platformID + ' ' + rec.encodingID + ' ' + rec.languageID] ??= 0;
          nameRecords[rec.platformID + ' ' + rec.encodingID + ' ' + rec.languageID]++;
        });
      } catch (error) {
        console.error(error);
      }
    }
    console.log(files.length, 'files found');

    console.log('tables used:');
    Object.keys(tables)
      .sort((a, b) => tables[b] - tables[a])
      .forEach((tag) => console.log(tag, tables[tag]));

    console.log('cmap subtables used (platformID encodingID format):');
    Object.keys(cmapSubtables)
      .sort((a, b) => cmapSubtables[b] - cmapSubtables[a])
      .forEach((n) => console.log(n, cmapSubtables[n]));
    console.log('name records used (platformID encodingID languageID):');
    Object.keys(nameRecords)
      .sort((a, b) => nameRecords[b] - nameRecords[a])
      .forEach((n) => console.log(n, nameRecords[n]));
  }
}

async function findFiles(path: string, filter?: (name: string) => boolean): Promise<string[]> {
  const stats = await stat(path);
  if (stats.isFile()) {
    return filter === undefined || filter(path) ? [path] : [];
  }
  if (stats.isDirectory()) {
    const entries = await readdir(path);
    const files = await Promise.all(entries.map((entry) => findFiles(join(path, entry), filter)));
    return files.flat();
  }
  return [];
}
