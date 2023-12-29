import { readFile } from 'node:fs/promises';

import { Font, parse } from 'opentype.js';

main();

async function main() {
  const args = process.argv.slice(2);
  for (const path of args) {
    const data = await readFile(path);
    console.log(path);

    const font = parse(data.buffer);

    console.log(font.getEnglishName('fullName'));
    console.log('numGlyphs', font.tables.maxp.numGlyphs);
    console.log('xAvgCharWidth', font.tables.os2.xAvgCharWidth);

    console.log('codepoint 220 -> ', font.charToGlyphIndex(String.fromCharCode(220)));
    console.log('codepoint 730 -> ', font.charToGlyphIndex(String.fromCharCode(730)));
  }
}
