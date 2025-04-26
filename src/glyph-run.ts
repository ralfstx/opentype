export type PositionedGlyph = {
  glyphId: number;
  xPlacement?: number;
  yPlacement?: number;
  xAdvance?: number;
  yAdvance?: number;
};

export type GlyphRun = {
  glyphs: PositionedGlyph[];
};
