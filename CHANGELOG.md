# Changelog

## Unreleased

### Added

- Support for formats 1 (glyph-based) and 2 (class-based) of GSUB
  lookup type 6 (chaining contextual substitution).
- Support for GPOS lookup type 6 (mark-to-mark attachment). This stacks
  combining marks, e.g. a circumflex and an acute on the same base
  glyph. Applied automatically via the `mkmk` feature.
- Support for GPOS lookup type 5 (mark-to-ligature attachment). This
  positions combining marks that follow a ligature, attaching them to
  the last ligature component. Applied automatically via the `mark`
  feature.
- Support for GPOS lookup types 7 (context positioning) and 8 (chaining
  context positioning) with all three formats. This enables contextual
  kerning, e.g. reduced kerning before glyphs with combining marks.
- The new method `HmtxTable.getMetric()` returns the horizontal metrics
  of a glyph, including glyphs that share the last advance width.

### Fixed

- Text shaping assigned an advance width of zero to glyphs beyond the
  `numberOfHMetrics` entries of the `hmtx` table instead of the last
  advance width. This affected mainly monospaced fonts.
- Subsets created with the `keepHinting` option kept the glyph
  instructions but not the `cvt `, `fpgm`, and `prep` tables they depend
  on, so renderers applied hinting with wrong values. These tables and
  the `gasp` table are now included.
- The table directory of subset fonts was not sorted by tag, as the
  OpenType spec requires. Strict font parsers could fail to find tables.
- Text shaping failed for fonts with a GSUB or GPOS subtable in an
  unsupported format or with invalid data. Such subtables are now
  skipped.
- Class-based GPOS pair adjustments were applied to glyphs not covered
  by the subtable, which resulted in wrong kerning in some fonts.
- Combining marks were not positioned when another mark preceded them
  on the same base glyph, unless the font's `mark` lookups ignore marks.

## 0.3.0 - 2026-04-02

### Added

- Support for the `GDEF` table. The new `GdefTable` class provides
  glyph classification, mark attachment classes, and mark glyph sets
  used by OpenType layout processing.
- Support for the legacy `kern` table. Fonts that don't have kerning in
  the `GPOS` table now get kerning applied from the `kern` table.
- Support for GSUB lookup type 3 (alternate substitution). This enables
  character variant features (`cv01`–`cv99`) and stylistic alternates
  (`salt`).
- Support for GSUB lookup type 5 (context substitution) with all three
  formats (glyph-based, class-based, and coverage-based rules). This
  enables context-dependent glyph composition, such as replacing `i`
  with a dotless variant before combining marks (`ccmp`).
- Support for GSUB lookup type 6 (chaining contextual substitution) with
  format 3 (coverage-based rules). This enables context-dependent
  features such as fractions (`frac`) and contextual alternates (`calt`).
- Support for GSUB lookup type 7 (extension substitution). This supports
  fonts with large GSUB tables that require extension lookups to
  reference subtables.
- Support for GPOS lookup type 4 (mark-to-base attachment). This
  positions combining marks such as accents relative to base glyphs
  (e.g. é, ñ, ü). Applied automatically via the `mark` feature.
- Support for GPOS lookup type 9 (extension positioning). This supports
  fonts with large GPOS tables that require extension lookups to
  reference subtables.

### Breaking changes

- `FsSelection` values (bit masks for the OS/2 `fsSelection` field) are
  now upper case, e.g. `ITALIC`, to align with the spec.

## 0.2.0 - 2026-01-17

### Added

- The new class `TextShaper` has been introduced, along with the types
  `ShapeOptions`, `GlyphRun`, and `ShapedGlyph`.

### Fixed

- The `maxp` table of subset fonts incorrectly set all limits to zero.

### Breaking changes

- The `subsetFont` function was renamed to `createSubset`.
- The return type of `createSubset` was changed to `SubsetResult`, which
  includes the subset font as `Uint8Array` and the mapping of original
  to subset glyph IDs.

## 0.1.0 - 2025-12-29

First published version.
