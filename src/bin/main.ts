/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { readFont } from 'src/font.ts';
import { nameIDs } from 'src/tables/name.ts';

main();

async function main() {
  const args = process.argv.slice(2);
  for (const path of args) {
    const data = await readFile(path);
    console.log(path);

    const font = readFont(data);

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

    // Ligatures
    const gsub = font.tables.gsub;
    if (gsub) {
      console.log('ligatures');
      for (const lookup of gsub.lookupListTable.lookups) {
        if (lookup.lookupType === 4 /* Ligature Substitution */) {
          for (const subTable of lookup.subTables) {
            const cov = subTable.coverage;
            let idx = 0;
            for (const glyphId of cov.glyphIds) {
              console.log(' glyphId', glyphId);
              const ligatureSet = subTable.readLigatureSet(idx++);
              for (let ligIdx = 0; ligIdx < ligatureSet.ligatureCount; ligIdx++) {
                const ligature = ligatureSet.readLigatureTable(ligIdx);
                console.log('  lig comps', ligature.compGlyphIDs, ligature.ligGlyph);
                // const substitutionGlyphIndex = ligature.ligGlyph;
                // Form the ligature key (Unicode character sequence)
                // const ligatureKey = components.join('');
                // // Retrieve the substitution glyph
                // const substitutionGlyph = font.glyphs[substitutionGlyphIndex];
                // // Add to the ligatures map
                // ligaturesMap.set(ligatureKey, substitutionGlyph);
              }
            }
          }
        }
      }
    }
  }
}
