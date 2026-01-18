# Changelog

## Next release

### Added

- `FsSelectionFlags` which provides bit masks for the `fsSelection`
  field in the OS/2 table.

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
