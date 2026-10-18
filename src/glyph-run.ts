/**
 * Represents a single glyph in a shaped glyph run, containing its
 * positioning information for text rendering.
 */
export type ShapedGlyph = {
  /** The glyph ID in the font. */
  glyphId: number;

  /**
   * The Unicode code points that this glyph represents. For simple glyphs,
   * this is a single code point. For ligatures (e.g., "ffi"), this contains
   * all constituent code points [0x66, 0x66, 0x69].
   */
  codePoints: number[];

  /**
   * Base horizontal advance from hmtx. This is the default pen movement
   * after rendering this glyph, before any GPOS adjustments. It is zero
   * for mark glyphs, such as combining accents, which do not move the pen.
   */
  advance: number;

  /**
   * GPOS horizontal advance adjustment (e.g., kerning). Added to `advance`
   * to get the total pen movement. Affects placement of all subsequent
   * glyphs. Negative values bring glyphs closer together.
   */
  advanceAdjust?: number;

  /**
   * Horizontal offset for rendering this glyph, relative to the current
   * pen position. Used for fine-tuning glyph placement (e.g., mark
   * positioning). Does not affect subsequent glyphs.
   */
  xOffset?: number;

  /**
   * Vertical offset for rendering this glyph, relative to the current
   * pen position. Positive values move the glyph upward. Does not affect
   * subsequent glyphs.
   */
  yOffset?: number;
};

/**
 * A sequence of shaped glyphs resulting from text layout.
 */
export type GlyphRun = {
  /** The shaped glyphs in visual order. */
  glyphs: ShapedGlyph[];
};
