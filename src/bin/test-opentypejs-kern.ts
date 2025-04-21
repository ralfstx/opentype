/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';

import { type Font, parse } from 'opentype.js';

main();

async function main() {
  const data = await readFile(
    '/home/ralf/git/pdf-maker/examples/fonts/DejaVuSansCondensed-Oblique.ttf',
  );

  const font = parse(data.buffer);

  const name = font.getEnglishName('fullName');

  console.log(name);

  // const tables = font.toTables();
  // console.log(tables);
  // tables.kerningPairs?.forEach((pair: any) => {
  //   console.log(pair);
  // });

  // Object.entries(font.kerningPairs).forEach(([pair, value]) => {
  //   const glyphs = pair.split(',').map((glyph) => Number(glyph));
  //   const name1 = (font.glyphNames as any).names[glyphs[0]];
  //   const name2 = (font.glyphNames as any).names[glyphs[1]];
  //   console.log(pair, name1, name2, value);
  // });

  const run = createGlyphRun('Hello, Vorld!', font, 72);
  console.log(run);
}

function createGlyphRun(text: string, font: Font, fontSize: number) {
  let x = 0;
  const options = font.defaultRenderOptions;
  const fontScale = (1 / font.unitsPerEm) * fontSize;
  const glyphs = font.stringToGlyphs(text);
  const run = { glyphs: [] as any[], xAdvance: 0 };
  for (let i = 0; i < glyphs.length; i += 1) {
    const glyph = glyphs[i];
    const element = { x, xOffset: 0, glyph: glyph.index };
    run.glyphs.push(element);
    if (glyph.advanceWidth) {
      x += glyph.advanceWidth * fontScale;
    }

    if (options.kerning && i < glyphs.length - 1) {
      // We should apply position adjustment lookups in a more generic way.
      // Here we only use the xAdvance value.
      const kerningValue = getKerningValue(font, glyph, glyphs[i + 1]);
      if (kerningValue) {
        element.xOffset = kerningValue * fontScale;
      }
      x += kerningValue * fontScale;
    }

    if (options.letterSpacing) {
      x += options.letterSpacing * fontSize;
    } else if (options.tracking) {
      x += (options.tracking / 1000) * fontSize;
    }
  }
  run.xAdvance = x;
  return run;
}

function getKerningValue(font: Font, leftGlyph: any, rightGlyph: any) {
  // eslint-disable-next-line no-param-reassign
  leftGlyph = leftGlyph.index || leftGlyph;
  // eslint-disable-next-line no-param-reassign
  rightGlyph = rightGlyph.index || rightGlyph;
  // const gposKerning = (font as any).position.defaultKerningTables;
  // if (gposKerning) {
  //   console.log('gposKerning');
  //   return (font as any).position.getKerningValue(gposKerning, leftGlyph, rightGlyph);
  // }
  // "kern" table
  return font.kerningPairs[leftGlyph + ',' + rightGlyph] || 0;
}
