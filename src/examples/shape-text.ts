/* eslint-disable no-console */
/**
 * This example demonstrates how to use the TextShaper to shape text
 * into glyphs using a font's OpenType GSUB and GPOS tables.
 *
 * Usage: node src/examples/shape-text.ts <font-file> <characters>
 */

import { readFile } from 'node:fs/promises';

import { Font, TextShaper } from '../index.ts';

const [fontPath, text] = process.argv.slice(2);

if (!fontPath || !text) {
  console.error('Usage: shape-text.ts <font-file> <characters>');
  process.exit(1);
}

// Load the font
console.log(`Loading font: ${fontPath}`);
const fontData = await readFile(fontPath);
const font = Font.fromData(fontData);

const shaper = new TextShaper(font);
const glyphRun = shaper.shape(text);

console.log('Shaped text:');
for (const glyph of glyphRun.glyphs) {
  console.log({
    glyphId: glyph.glyphId, // Glyph ID in the font
    codePoints: glyph.codePoints, // Unicode code points (for ligatures: multiple)
    advance: glyph.advance, // Horizontal advance (font units)
    ...(glyph.advanceAdjust ? { advanceAdjust: glyph.advanceAdjust } : {}), // Kerning adjustment (if any)
    ...(glyph.xOffset ? { xOffset: glyph.xOffset } : {}), // Positioning offsets (if any)
    ...(glyph.yOffset ? { yOffset: glyph.yOffset } : {}), // Positioning offsets (if any)
  });
}
