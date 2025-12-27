/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { Font, NameIDs } from '../index.ts';

await main();

async function main() {
  const args = process.argv.slice(2);
  for (const path of args) {
    const data = await readFile(path);
    console.log(path);

    const font = Font.fromData(data);

    console.log('Font name:', font.tables.name?.findName(NameIDs.fullFontName));
    console.log('Type:', font.type);
    console.log('Version:', font.tables.name?.findName(NameIDs.versionString));
    console.log('numGlyphs', font.tables.maxp?.numGlyphs);
    console.log('xAvgCharWidth', font.tables['OS/2']?.xAvgCharWidth);
    console.log(`unitsPerEm: ${font.tables.head?.unitsPerEm}`);

    console.log('tables:');
    font.tableRecords.forEach((rec) => console.log(rec.tableTag, rec.offset, rec.length));
  }
}
