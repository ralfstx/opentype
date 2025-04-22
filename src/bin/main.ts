/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { Font } from 'src/font.ts';
import { nameIDs } from 'src/tables/name.ts';

main();

async function main() {
  const args = process.argv.slice(2);
  for (const path of args) {
    const data = await readFile(path);
    console.log(path);

    const font = Font.fromData(data);

    console.log(
      'Font name:',
      font.tables.name?.findName(nameIDs.fullFontName, 'en-US', 'en')?.string,
    );
    console.log(
      'Version:',
      font.tables.name?.findName(nameIDs.versionString, 'en-US', 'en')?.string,
    );

    console.log('tables:');
    font.tableRecords.forEach((rec) => console.log(rec.tableTag, rec.offset, rec.length));

    console.log('numGlyphs', font.tables.maxp?.numGlyphs);
    console.log('xAvgCharWidth', font.tables.os2?.xAvgCharWidth);
  }
}
