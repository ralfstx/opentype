import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { readFont } from 'src/otf.ts';
import { nameIDs } from 'src/tables/name.ts';

main();

async function main() {
  const args = process.argv.slice(2);
  for (const path of args) {
    const data = await readFile(path);
    console.log(path);

    const font = readFont(data);
    const name = font.tables.name?.findName(nameIDs.fullFontName, 'en-US', 'en')?.string;
    const version = font.tables.name?.findName(nameIDs.versionString, 'en-US', 'en')?.string;

    console.log('Font name:', name);
    console.log('Version:', version);
    console.log('Number of glyphs', font.tables.maxp.numGlyphs);

    console.log('Tables:');
    console.log('Tag  Size');
    console.log('---- --------');
    font.tableRecords.forEach((rec) => console.log(rec.tableTag, rec.length));
  }
}
