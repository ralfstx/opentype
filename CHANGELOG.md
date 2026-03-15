# Changelog

## Next release

### Added

- Support for the `GDEF` table. The new `GdefTable` class provides
  glyph classification, mark attachment classes, and mark glyph sets
  used by OpenType layout processing.
- Support for the legacy `kern` table. Fonts that don't have kerning in
  the `GPOS` table now get kerning applied from the `kern` table.
- Support for GSUB lookup type 5 (context substitution) with all three
  formats (glyph-based, class-based, and coverage-based rules). This
  enables context-dependent glyph composition, such as replacing `i`
  with a dotless variant before combining marks (`ccmp`).
- Support for GSUB lookup type 6 (chaining contextual substitution) with
  format 3 (coverage-based rules). This enables context-dependent
  features such as fractions (`frac`) and contextual alternates (`calt`).
- Support for GSUB lookup type 3 (alternate substitution). This enables
  character variant features (`cv01`–`cv99`) and stylistic alternates
  (`salt`).
- Support for GSUB lookup type 7 (extension substitution). This supports
  fonts with large GSUB tables that require extension lookups to
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
