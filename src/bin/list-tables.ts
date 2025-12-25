/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { Font } from '../font.ts';
import { nameIDs } from '../tables/name.ts';

await main();

async function main() {
  const args = process.argv.slice(2);
  for (const path of args) {
    const data = await readFile(path);
    console.log(path);

    const font = Font.fromData(data);
    const name = font.tables.name?.findName(nameIDs.fullFontName)?.name;
    const version = font.tables.name?.findName(nameIDs.versionString)?.name;

    console.log('Font name:', name);
    console.log('Version:', version);
    console.log('Number of glyphs', font.tables.maxp?.numGlyphs);

    console.log('Tables:');
    console.log('Tag  Size');
    console.log('---- --------');
    font.tableRecords.forEach((rec) => console.log(rec.tableTag, rec.length));
  }
}
