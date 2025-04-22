import { type Font } from './font.ts';
import { LigatureSubtable } from './tables/gsub.ts';

export function createGlyphRun(text: string, font: Font) {
  // Step 1: Map Unicode characters to glyph IDs using 'cmap'

  const glyphSequence = createGlyphSequence(text, font);

  // Step 2: Apply GSUB substitutions

  const glyphSequenceSubst = applyGsub(glyphSequence, font);

  // eslint-disable-next-line no-console
  console.log('glyphSequenceSubst', glyphSequenceSubst);

  // Step 3: Apply GPOS positioning
}

function createGlyphSequence(text: string, font: Font): number[] {
  const glyphSequence = [];

  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error('Invalid character in string: ' + character);
    }
    // By OpenType convention, glyph ID 0 is reserved for the .notdef glyph
    const glyphID = font.lookupGlyphId(codePoint) ?? 0;
    glyphSequence.push(glyphID);
  }

  return glyphSequence;
}

function applyGsub(glyphSequence: number[], font: Font): number[] {
  const desiredFeatures = ['ccmp', 'liga', 'clig', 'calt', 'locl', 'rlig'];

  let newGlyphSequence = glyphSequence.slice();
  const gsub = font.tables.gsub;
  if (!gsub) return newGlyphSequence;

  const langSysTable = gsub.findLangSysTable('latn', 'dflt');
  if (!langSysTable) return newGlyphSequence;

  for (const featureIndex of langSysTable.featureIndices) {
    const featureRec = gsub.featureListTable.featureRecords[featureIndex];
    if (!desiredFeatures.includes(featureRec.featureTag)) {
      continue;
    }

    const featureTable = featureRec.featureTable;

    for (const lookupIndex of featureTable?.lookupListIndices ?? []) {
      const lookupTable = gsub.lookupListTable.readLookupTable(lookupIndex);
      if (lookupTable === undefined) continue;
      for (let i = 0; i < lookupTable.subTableCount; i++) {
        if (lookupTable.lookupType !== 4) {
          // TODO: Handle other lookup types
          continue;
        }
        const ligSubtable = new LigatureSubtable(lookupTable.getSubTableData(i));
        newGlyphSequence = ligSubtable.applyToGlyphSequence(newGlyphSequence);
      }
    }
  }

  return newGlyphSequence;
}

// function applyGpos(glyphSequence: number[], font: Font): number[] {
//   const desiredFeatures = ['kern', 'mark', 'mkmk', 'liga', 'curs'];
//   let positions = initializeDefaultPositions(glyphSequence);
//   for (const feature of features) {
//     const lookups = gposTable.getLookupsForFeature(feature);
//     for (const lookup of lookups) {
//       positions = applyPositioningLookup(glyphSequence, positions, lookup);
//     }
//     return positions;
//   }
// }
