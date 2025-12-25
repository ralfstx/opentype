/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { Font } from '../font.ts';
import { nameIDs } from '../tables/name.ts';
import { TextLayout } from '../text-layout.ts';

main();

async function main() {
  const args = process.argv.slice(2);
  for (const path of args) {
    const data = await readFile(path);
    console.log(path);

    const font = Font.fromData(data);

    console.log('Font name:', font.tables.name?.findName(nameIDs.fullFontName));
    console.log('Version:', font.tables.name?.findName(nameIDs.versionString));

    console.log('tables:');
    font.tableRecords.forEach((rec) => console.log(rec.tableTag, rec.offset, rec.length));

    console.log('numGlyphs', font.tables.maxp?.numGlyphs);
    console.log('xAvgCharWidth', font.tables['OS/2']?.xAvgCharWidth);

    const cmapSubTable = font.tables.cmap?.encodingRecords[1].readSubtable();
    console.log('Codepoint 220 ->', cmapSubTable?.lookupGlyphId(220));
    console.log('Codepoint 730 ->', cmapSubTable?.lookupGlyphId(730));

    // GSUB

    const gsub = font.tables.GSUB;
    if (gsub) {
      console.log('  scripts');
      gsub?.scriptListTable.scriptRecords.forEach((rec) => {
        console.log('    ' + rec.scriptTag);
        rec.scriptTable.langSysRecords.forEach((langSysRec) => {
          console.log('      langSys', langSysRec.langSysTag);
          const langSysTable = langSysRec.langSysTable;
          const features = langSysTable.featureIndices.map((featureIndex) => {
            const feature = font.tables.GSUB?.featureListTable.featureRecords.at(featureIndex);
            if (!feature) throw new Error('no feature at index ' + featureIndex);
            return feature.featureTag;
          });
          console.log('          features', features);
        });
      });

      console.log('GSUB');
      const langSysTable = gsub.findLangSysTable('latn', 'ENG');

      if (langSysTable) {
        console.log('  features:');
        gsub.featureListTable.featureRecords.forEach((feature) => {
          console.log('    ' + feature.featureTag);
          feature.featureTable.lookupListIndices.forEach((lookupIndex) => {
            const lookupTable = gsub.lookupListTable.readLookupTable(lookupIndex);
            console.log(`      lookup type: ${lookupTable.lookupType}`);
            console.log(`      subtables: ${lookupTable.subTableCount}`);
          });
        });
      } else {
        console.log('  no langSysTable');
      }
    }

    // GPOS

    const gpos = font.tables.GPOS;
    if (gpos) {
      console.log('GPOS');
      const langSysTable = gpos.findLangSysTable('latn', 'ENG');

      if (langSysTable) {
        console.log('  features:');
        gpos.featureListTable.featureRecords.forEach((feature) => {
          console.log('    ' + feature.featureTag);
          feature.featureTable.lookupListIndices.forEach((lookupIndex) => {
            const lookupTable = gpos.lookupListTable.readLookupTable(lookupIndex);
            console.log(`      lookup type: ${lookupTable.lookupType}`);
            console.log(`      subtables: ${lookupTable.subTableCount}`);
          });
        });
      } else {
        console.log('  no langSysTable');
      }
    }

    const text = 'ABCfiffiflfflWoTo';
    const layout = new TextLayout(font, 'latn', 'ENG');
    const glyphRun = layout.layout(text);
    console.log('Glyph run:');
    glyphRun.glyphs.forEach((glyph) => {
      console.log(
        ' ',
        String(glyph.glyphId).padStart(4, ' '),
        ' ',
        glyph.xPlacement ?? 0,
        glyph.yPlacement ?? 0,
        glyph.xAdvance ?? 0,
        glyph.yAdvance ?? 0,
      );
    });
  }
}
