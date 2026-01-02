/* eslint-disable no-console */
/**
 * Usage: node src/bin/test-layout.ts <font-file> <characters>
 *
 * Example: node src/bin/test-layout.ts ~/fonts/Roboto-Regular.ttf "Hello World"
 */

import { readFile } from 'node:fs/promises';

import { Font, TextShaper } from '../index.ts';

const [fontPath, text] = process.argv.slice(2);

if (!fontPath || !text) {
  console.error('Usage: node src/bin/make-subset.ts <font-file> <characters>');
  process.exit(1);
}

// Load the font
console.log(`Loading font: ${fontPath}`);
const fontData = await readFile(fontPath);
const font = Font.fromData(fontData);

const shaper = new TextShaper(font, 'latn', 'en');
const glyphRun = shaper.shape(text);

console.log('Shaped text:');
for (const glyph of glyphRun.glyphs) {
  console.log({
    glyphId: glyph.glyphId, // Glyph ID in the font
    codePoints: glyph.codePoints, // Unicode code points (for ligatures: multiple)
    advance: glyph.advance, // Horizontal advance (font units)
    advanceAdjust: glyph.advanceAdjust, // Kerning adjustment (if any)
  });
}
