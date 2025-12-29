/**
 * Usage: node src/bin/make-subset.ts <font-file> <characters>
 *
 * Example: node src/bin/make-subset.ts ~/fonts/Roboto-Regular.ttf "Hello World"
 */
/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { Font, subsetFont } from '../index.ts';

const [fontPath, text] = process.argv.slice(2);

if (!fontPath || !text) {
  console.error('Usage: node src/bin/make-subset.ts <font-file> <characters>');
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
const namePrefix = Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const subsetData = subsetFont(font, glyphIds, namePrefix);
console.log(`Subset font size: ${subsetData.byteLength} bytes`);
console.log(`Reduction: ${((1 - subsetData.byteLength / fontData.byteLength) * 100).toFixed(1)}%`);

// Write subset to file
await mkdir('out', { recursive: true });
const outputPath = join('out', basename(fontPath).replace(/\.(ttf|otf)$/i, '-subset.$1'));
await writeFile(outputPath, new Uint8Array(subsetData.buffer));
console.log(`\nSubset written to: ${outputPath}`);

// Verify the subset can be parsed
console.log(`\nVerifying subset...`);
const subsetFont2 = Font.fromData(new Uint8Array(subsetData.buffer));
console.log(`Tables in subset:`);
for (const record of subsetFont2.tableRecords) {
  console.log(`  ${record.tableTag}: ${record.length} bytes`);
}

console.log(`\nNumber of glyphs in subset: ${subsetFont2.tables.maxp?.numGlyphs}`);
console.log(`\n✓ Subset created successfully!`);
