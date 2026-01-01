# OpenType

A TypeScript library for parsing OpenType and TrueType fonts, designed
primarily for the needs of PDF document generation. The library provides
access to the most commonly used OpenType tables and supports font
subsetting.

## Features

### Font Parsing

Access to essential OpenType font tables:

- `head` (Font Header)
- `hhea` (Horizontal Header)
- `hmtx` (Horizontal Metrics)
- `maxp` (Maximum Profile)
- `cmap` (Character to Glyph Mapping)
- `glyf` (Glyph Data)
- `loca` (Index to Location)
- `name` (Naming Table)
- `OS/2` (OS/2 and Windows Metrics)
- `post` (PostScript Information)
- `GPOS` (Glyph Positioning)
- `GSUB` (Glyph Substitution)

### Font Subsetting

Build subset fonts containing only required glyphs for embedding in PDF documents

## Installation

```bash
npm install @ralfstx/opentype
```

## Usage

### Loading Fonts

```typescript
import { Font } from '@ralfstx/opentype';
import { readFile } from 'node:fs/promises';

// Load a font file
const fontData = await readFile('path/to/font.ttf');
const font = Font.fromData(fontData);

// Access font properties
console.log(font.fontName); // Full font name
console.log(font.numGlyphs); // Number of glyphs
console.log(font.unitsPerEm); // Units per em square
```

### Accessing Font Tables

```typescript
// Access specific tables
const headTable = font.tables.head;
const cmapTable = font.tables.cmap;
const glyfTable = font.tables.glyf;

// Get glyph ID for a character
const glyphId = font.glyphMapping?.get('A'.codePointAt(0)!);

// Get horizontal metrics
const hmtx = font.tables.hmtx;
const metric = hmtx?.getMetric(glyphId);
console.log(metric?.advanceWidth);
```

### Font Subsetting

```typescript
import { subsetFont } from '@ralfstx/opentype';

// Get glyph IDs for specific characters
const text = 'Hello, World!';
const glyphIds = Array.from(text)
  .map((char) => font.glyphMapping?.get(char.codePointAt(0)!))
  .filter((id) => id !== undefined);

// Create a subset font
const subsetData = subsetFont(font, glyphIds);

// Save the subset font
await writeFile('subset.ttf', new Uint8Array(subsetData.buffer));
```

## License

[MIT](LICENSE.txt)

## Resources

### Specifications

- [OpenType Specification](https://docs.microsoft.com/en-us/typography/opentype/spec/)
- [TrueType Reference Manual](https://developer.apple.com/fonts/TrueType-Reference-Manual/)

### Related Libraries

- [opentype.js](https://github.com/opentypejs/opentype.js) - JavaScript OpenType parser
- [fontkit](https://github.com/foliojs/fontkit) - Advanced font toolkit for Node
- [fonttools](https://github.com/fonttools/fonttools) - Python font manipulation library
- [Fontations](https://github.com/googlefonts/fontations) - Rust font parsing library
