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

    // const cmap = font.tables.cmap.encodingRecords[1].readSubtable();
    // console.log('Codepoint 220 ->', cmap.lookupGlyphId(220));
    // console.log('Codepoint 730 ->', cmap.lookupGlyphId(730));

    console.log('GSUB');
    console.log('  script count', font.tables.gsub?.scriptCount);
    font.tables.gsub?.script_records.forEach((rec) => {
      console.log('    rec', rec.scriptTag.toString());
      console.log('      defaultLangSys', rec.defaultLangSys);
      console.log('      langSysCount', rec.langSysCount);
      rec.langSysRecords.forEach((langSysRec) => {
        console.log('      langSysRec', langSysRec.langSysTag.toString());
        const langSysTable = rec.readLangSysTable(langSysRec);
        console.log('        requiredFeatureIndex', langSysTable.requiredFeatureIndex);
        langSysTable.featureIndices.forEach((featureIndex) => {
          console.log('        featureIndex', featureIndex);
          const feature = font.tables.gsub?.featureListTable.featureRecords.at(featureIndex);
          if (!feature) throw new Error('no feature at index ' + featureIndex);
          console.log('          featureTag', feature.featureTag.toString());
        });
      });
    });
  }
}
