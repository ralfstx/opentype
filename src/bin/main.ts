/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { Font } from 'src/font.ts';
import { createGlyphRun } from 'src/layout.ts';
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

    const cmapSubTable = font.tables.cmap?.encodingRecords[1].readSubtable();
    console.log('Codepoint 220 ->', cmapSubTable?.lookupGlyphId(220));
    console.log('Codepoint 730 ->', cmapSubTable?.lookupGlyphId(730));

    console.log('GSUB');

    console.log('  script count', font.tables.gsub?.scriptListTable.scriptRecords.length);
    font.tables.gsub?.scriptListTable.scriptRecords.forEach((rec) => {
      console.log('    rec', rec.scriptTag);
      console.log('      langSysCount', rec.scriptTable.langSysRecords.length);
      rec.scriptTable.langSysRecords.forEach((langSysRec) => {
        console.log('      langSysRec', langSysRec.langSysTag);
        const langSysTable = langSysRec.langSysTable;
        // console.log('        requiredFeatureIndex', langSysTable.requiredFeatureIndex);
        const features = langSysTable.featureIndices.map((featureIndex) => {
          const feature = font.tables.gsub?.featureListTable.featureRecords.at(featureIndex);
          if (!feature) throw new Error('no feature at index ' + featureIndex);
          return feature.featureTag;
        });
        console.log('          features', features);
      });
    });

    // Features
    const featureList = font.tables.gsub?.featureListTable.featureRecords;
    if (featureList) {
      console.log('features');
      for (let i = 0; i < featureList.length; i++) {
        const feature = featureList[i];
        console.log('  feature', i, feature.featureTag);
        console.log('    lookup indices', feature.featureTable.lookupListIndices);
      }
    }

    // Ligatures
    const gsub = font.tables.gsub;
    if (gsub) {
      console.log('ligatures');
      for (let i = 0; i < gsub.lookupListTable.lookupCount; i++) {
        const lookupTable = gsub.lookupListTable.readLookupTable(i);
        if (lookupTable.lookupType === 4 /* Ligature Substitution */) {
          console.log('  lookup table', i);
        }
      }
    }

    createGlyphRun('fi ffi fl ffl', font);
  }
}
