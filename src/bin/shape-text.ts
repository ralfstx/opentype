/**
 * Usage: node src/bin/test-layout.ts <font-file> <characters>
 *
 * Example: node src/bin/test-layout.ts ~/fonts/Roboto-Regular.ttf "Hello World"
 */

import { readFile } from 'node:fs/promises';

import { Font } from '../index.ts';
import { TextShaper } from '../text-shaper.ts';

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

console.log(`Shaped text`, JSON.stringify(glyphRun, null, 2));
