# Changelog

## Next release

### Added

- Support for the `GDEF` table. The new `GdefTable` class provides
  glyph classification, mark attachment classes, and mark glyph sets
  used by OpenType layout processing.
- Support for the legacy `kern` table. Fonts that don't have kerning in
  the `GPOS` table now get kerning applied from the `kern` table.

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
