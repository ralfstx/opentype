/* eslint-disable no-console */
/**
 * This example demonstrates how to create a subset of a TrueType font
 * containing only the glyphs needed for a specified set of characters.
 *
 * Usage: node src/examples/make-subset.ts <font-file> <characters>
 *
 * Example: node src/examples/make-subset.ts ~/fonts/Roboto-Regular.ttf "Hello World"
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import process from 'node:process';

import { createSubset, Font } from '../index.ts';

const [fontPath, text] = process.argv.slice(2);

if (!fontPath || !text) {
  console.error(`Usage: node make-subset.ts <font-file> <characters>`);
  process.exit(1);
}

// Load the font
console.log(`Loading font: ${fontPath}`);
const fontData = await readFile(fontPath);
const font = Font.fromData(fontData);
console.log(`Original font size: ${fontData.byteLength} bytes`);

// Check if font has glyf table (TrueType)
if (!font.tables.glyf) {
  console.error('Error: Font does not have a glyf table (not a TrueType font)');
  console.error('CFF fonts are not yet supported for subsetting');
  process.exit(1);
}

// Get unique characters and their glyph IDs
const chars = [...new Set(text)];
const glyphIds: number[] = [];
const charToGlyph: Record<string, number | undefined> = {};

// Note: This simple approach does not handle complex scripts, ligatures, or
// combining characters. A full implementation would need to shape the text
// and include all glyphs used in the shaping process.
for (const char of chars) {
  const codePoint = char.codePointAt(0)!;
  const glyphId = font.glyphMapping?.get(codePoint);
  charToGlyph[char] = glyphId;
  if (glyphId !== undefined) {
    glyphIds.push(glyphId);
  }
}

console.log(`\nCharacters to include: "${text}"`);
console.log(`Unique characters: ${chars.length}`);

// Print missing glyphs
const missingChars = chars.filter((c) => charToGlyph[c] === undefined);
if (missingChars.length > 0) {
  console.log(`\nWarning: The following characters were not found in the font:`);
  for (const char of missingChars) {
    console.log(`  '${char}' (U+${char.codePointAt(0)!.toString(16).padStart(4, '0')})`);
  }
} else {
  console.log(`All characters found in the font.`);
}

// Create subset
console.log(`\nCreating subset with ${glyphIds.length} glyphs...`);
const { fontData: subsetData } = createSubset(font, glyphIds);
console.log(`Subset font size: ${subsetData.byteLength} bytes`);
console.log(`Reduction: ${((1 - subsetData.byteLength / fontData.byteLength) * 100).toFixed(1)}%`);

// Write subset to file
await mkdir('out', { recursive: true });
const outputPath = join('out', basename(fontPath).replace(/\.(ttf|otf)$/i, '-subset.$1'));
await writeFile(outputPath, subsetData);
console.log(`\nSubset written to: ${outputPath}`);

// Verify the subset can be parsed
console.log(`\nVerifying subset...`);
const subsetFont = Font.fromData(subsetData);
console.log(`Tables in subset:`);
for (const record of subsetFont.tableRecords) {
  console.log(`  ${record.tableTag}: ${record.length} bytes`);
}

console.log(`\nNumber of glyphs in subset: ${subsetFont.tables.maxp?.numGlyphs}`);
console.log(`\n✓ Subset created successfully!`);
