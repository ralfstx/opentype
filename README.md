# OpenType

A TypeScript library for reading OpenType and TrueType fonts, shaping
text, and creating font subsets, designed for PDF document generation.
Text shaping supports the OpenType layout features used for Latin,
Cyrillic, Greek, and other left-to-right scripts, including ligatures,
contextual alternates, kerning, and mark positioning.

## Features

- **Font parsing**: Read font metrics, character mappings, glyph data,
  and names from TrueType and OpenType fonts.
- **Text shaping**: Convert text into positioned glyphs, with ligatures,
  kerning, mark positioning, and other OpenType layout features.
- **Font subsetting**: Build subset fonts containing only the required
  glyphs for embedding in PDF documents.

See [Supported Features](#supported-features) for details.

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
// Tables are parsed on first access and are undefined if missing
const hhea = font.tables.hhea;
console.log(hhea?.ascender, hhea?.descender, hhea?.lineGap);

// Get the glyph ID for a character
const glyphId = font.glyphMapping.get('A'.codePointAt(0)!);

// Get the horizontal metrics of a glyph
const advanceWidth = font.tables.hmtx?.getMetric(glyphId!)?.advanceWidth;
```

### Text Shaping

Text shaping converts Unicode text into positioned glyphs, applying
OpenType features like ligatures and kerning. The result is a `GlyphRun`
containing `ShapedGlyph` objects ready for rendering.

```typescript
import { TextShaper } from '@ralfstx/opentype';

// Create a text shaper for Latin script, English language
const shaper = new TextShaper(font, { scriptTag: 'latn', langSysTag: 'ENG' });

// Shape text into a glyph run. In most fonts, "ffl" becomes a ligature
// and the space between "W" and "a" is reduced by kerning.
const glyphRun = shaper.shape('Waffles');

// Each glyph has positioning information
for (const glyph of glyphRun.glyphs) {
  console.log({
    glyphId: glyph.glyphId, // Glyph ID in the font
    codePoints: glyph.codePoints, // Unicode code points (for ligatures: multiple)
    advance: glyph.advance, // Horizontal advance (font units)
    advanceAdjust: glyph.advanceAdjust, // Kerning adjustment (if any)
    xOffset: glyph.xOffset, // Placement offsets, e.g. for marks (if any)
    yOffset: glyph.yOffset,
  });
}
```

**Script and language tags:**

Common script tags: `latn` (Latin), `cyrl` (Cyrillic), `grek` (Greek),
`hani` (CJK Ideographs). See the
[OpenType script tags](https://learn.microsoft.com/en-us/typography/opentype/spec/scripttags)
for a complete list.

**Optional features:**

The default features are listed under
[Layout Features](#layout-features) below. Common typographic features that
can be enabled:

- `smcp`: Small caps
- `c2sc`: Caps to small caps
- `subs`: Subscript
- `sups`: Superscript
- `frac`: Fractions

```typescript
// Enable small caps: lowercase letters are replaced by small capitals
const smallCaps = shaper.shape('Small Caps', { features: { smcp: true } });

// Disable a default feature, e.g. ligatures
const noLigatures = shaper.shape('Waffles', { features: { liga: false } });
```

### Font Subsetting

The `createSubset` function builds a subset font containing only the
specified glyphs, suitable for embedding in PDF documents. Take the
glyph IDs from the shaped text, as shaping can replace characters with
glyphs that are not in the character mapping, such as ligatures.

```typescript
import { createSubset } from '@ralfstx/opentype';
import { writeFile } from 'node:fs/promises';

// Collect the glyph IDs of all shaped text that uses the font
const glyphIds = shaper.shape('Waffles').glyphs.map((glyph) => glyph.glyphId);

// Create a subset font. Glyph IDs change in the subset, use
// glyphIdMapping to translate them when writing the text.
const { fontData, glyphIdMapping } = createSubset(font, glyphIds);

// Save the subset font
await writeFile('subset.ttf', fontData);
```

## Supported Features

The library focuses on what is needed to use fonts in PDF documents:
font metrics, text shaping for horizontal text, and font subsetting.

### Font Formats

| Format                                  | Parsing | Subsetting |
| --------------------------------------- | ------- | ---------- |
| TrueType outlines (`glyf` table)        | ✅      | ✅         |
| CFF outlines (`CFF ` and `CFF2` tables) | ✅ (1)  | ❌         |
| Font collections (TTC/OTC)              | ❌      | ❌         |
| Web fonts (WOFF/WOFF2)                  | ❌      | ❌         |
| Variable fonts (`fvar` table)           | ❌      | ❌         |

(1) Fonts with CFF outlines can be loaded, measured, and shaped, but
the outline tables themselves are not parsed, so these fonts cannot be
subset yet.

### Tables

| Table  | Read | Written by `createSubset` | Notes                                        |
| ------ | ---- | ------------------------- | -------------------------------------------- |
| `head` | ✅   | ✅                        |                                              |
| `hhea` | ✅   | ✅                        |                                              |
| `hmtx` | ✅   | ✅                        |                                              |
| `maxp` | ✅   | ✅                        |                                              |
| `cmap` | ✅   | ✅                        | All formats except legacy formats 2 and 8    |
| `glyf` | ✅   | ✅                        | Composite glyphs are included in subsets     |
| `loca` | ✅   | ✅                        |                                              |
| `name` | ✅   | ✅                        |                                              |
| `OS/2` | ✅   | ✅                        |                                              |
| `post` | ✅   | ✅                        | Subsets contain no glyph names (version 3.0) |
| `GDEF` | ✅   | –                         | Glyph classes and mark sets for layout       |
| `GSUB` | ✅   | –                         | See [GSUB lookup types](#gsub-lookup-types)  |
| `GPOS` | ✅   | –                         | See [GPOS lookup types](#gpos-lookup-types)  |
| `kern` | ✅   | –                         | All but format 2 subtables and Apple tables  |

The `cmap` formats 2 and 8 are used only for legacy East Asian
encodings. The `kern` format 2 (class-based) subtables and Apple's
extended `kern` table are rarely used and ignored.

Layout tables are not written to subsets, as PDF documents contain
already positioned glyphs.

### Layout Features

`TextShaper` applies the following features by default:

- GSUB: `locl`, `ccmp`, `rlig`, `liga`, `clig`, `calt`
- GPOS: `mark`, `mkmk`, `kern`

Other features can be enabled through the `features` option. If a font
has no `kern` feature in its `GPOS` table, the legacy `kern` table is
used instead.

#### GSUB lookup types

| Type | Name                         | Status |
| ---- | ---------------------------- | ------ |
| 1    | Single substitution          | ✅     |
| 2    | Multiple substitution        | ✅     |
| 3    | Alternate substitution       | ✅     |
| 4    | Ligature substitution        | ✅     |
| 5    | Context substitution         | ✅     |
| 6    | Chained context substitution | ✅     |
| 7    | Extension substitution       | ✅     |
| 8    | Reverse chained substitution | ❌ (2) |

All subtable formats of the supported lookup types are supported.
Alternate substitution always selects the first alternate.

#### GPOS lookup types

| Type | Name                        | Status |
| ---- | --------------------------- | ------ |
| 1    | Single adjustment           | ✅     |
| 2    | Pair adjustment             | ✅     |
| 3    | Cursive attachment          | ❌ (2) |
| 4    | Mark-to-base attachment     | ✅     |
| 5    | Mark-to-ligature attachment | ✅     |
| 6    | Mark-to-mark attachment     | ✅     |
| 7    | Context positioning         | ✅     |
| 8    | Chained context positioning | ✅     |
| 9    | Extension positioning       | ✅     |

All subtable formats of the supported lookup types are supported. Value
records and anchors use design units; device tables and contour point
anchors, which adjust positions for specific sizes or hinting, are
ignored.

(2) Only used by right-to-left scripts, which are not supported (see
[Limitations](#limitations)). Reverse chained substitution selects
contextual glyph forms in Arabic Nastaliq, and cursive attachment
connects the glyphs of joining scripts such as Arabic.

#### Limitations

- Only horizontal, left-to-right text is supported. Right-to-left and
  vertical text, as well as the reordering required by complex scripts
  such as Arabic or Indic scripts, are not supported.
- Marks on ligatures are attached to the last ligature component, which
  is not correct for marks that appear between the components in the
  text.
- Mark glyphs are recognized only through the `GDEF` table. For fonts
  without `GDEF` or `GPOS` tables, combining marks are not positioned,
  while some shaping engines position them based on Unicode properties.

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
