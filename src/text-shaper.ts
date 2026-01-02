import { type Font } from './font.ts';
import { type GlyphRun } from './glyph-run.ts';
import { readGposSubtable } from './tables/gpos.ts';
import { readGsubSubtable } from './tables/gsub.ts';

/** Default GSUB features applied automatically, in recommended order. */
const DEFAULT_GSUB_FEATURES = ['locl', 'ccmp', 'rlig', 'liga', 'clig', 'calt'];

/** Default GPOS features applied automatically. */
const DEFAULT_GPOS_FEATURES = ['kern'];

/**
 * Options for text shaping.
 */
export type ShapeOptions = {
  /**
   * Additional GSUB features to apply beyond the defaults.
   * Examples: 'smcp' (small caps), 'frac' (fractions), 'sups' (superscript).
   */
  features?: string[];
};

/**
 * Performs text shaping using OpenType GSUB and GPOS tables.
 *
 * Text shaping converts a Unicode string into a sequence of positioned
 * glyphs. This includes:
 * - Character to glyph mapping (via cmap)
 * - Glyph substitution (GSUB): ligatures, contextual alternates, etc.
 * - Glyph positioning (GPOS): kerning adjustments
 *
 * @example
 * ```typescript
 * const shaper = new TextShaper(font, 'latn', 'en');
 * const glyphRun = shaper.shape('Hello');
 * ```
 */
export class TextShaper {
  /** The font used for shaping. */
  readonly font: Font;

  /**
   * The OpenType script tag (e.g., 'latn' for Latin, 'arab' for Arabic).
   * See: https://learn.microsoft.com/en-us/typography/opentype/spec/scripttags
   */
  readonly script: string;

  /**
   * The OpenType language tag (e.g., 'en' for English, 'de' for German).
   * See: https://learn.microsoft.com/en-us/typography/opentype/spec/languagetags
   */
  readonly language: string;

  /**
   * Creates a new TextShaper for the given font, script, and language.
   *
   * @param font - The font to use for shaping
   * @param script - OpenType script tag (e.g., 'latn', 'cyrl', 'arab')
   * @param language - OpenType language tag (e.g., 'en', 'de', 'fr')
   */
  constructor(font: Font, script: string, language: string) {
    this.font = font;
    this.script = script;
    this.language = language;
  }

  /**
   * Shapes the given text into a GlyphRun.
   *
   * The shaping process:
   * 1. Maps each Unicode code point to a glyph ID (via cmap)
   * 2. Applies GSUB features (ligatures, contextual alternates, etc.)
   * 3. Applies GPOS features (kerning adjustments)
   *
   * Default GSUB features: locl, ccmp, rlig, liga, clig, calt
   * Default GPOS features: kern
   */
  shape(text: string, options?: ShapeOptions): GlyphRun {
    const glyphRun = this.createGlyphRun(text);
    this.applyGsub(glyphRun, options?.features);
    this.applyGpos(glyphRun);
    return glyphRun;
  }

  private createGlyphRun(text: string): GlyphRun {
    // Spread iterates over Unicode code points, correctly handling surrogate pairs
    const glyphs = [...text]
      .map((s) => s.codePointAt(0)!)
      .map((codePoint) => {
        // By OpenType convention, glyph ID 0 is reserved for the .notdef glyph
        const glyphId = this.font.glyphMapping?.get(codePoint) ?? 0;
        const advance = this.getAdvance(glyphId);
        return { glyphId, codePoints: [codePoint], advance };
      });

    return { glyphs };
  }

  private getAdvance(glyphId: number): number {
    return this.font.tables.hmtx?.hMetrics.at(glyphId)?.advanceWidth ?? 0;
  }

  private applyGsub(glyphRun: GlyphRun, extraFeatures?: string[]): void {
    // Combine default features with extra features, filtering out duplicates
    const desiredFeatures = extraFeatures
      ? [...DEFAULT_GSUB_FEATURES, ...extraFeatures.filter((f) => !DEFAULT_GSUB_FEATURES.includes(f))]
      : DEFAULT_GSUB_FEATURES;

    const gsub = this.font.tables.GSUB;
    if (!gsub) return;

    const langSysTable = gsub.findLangSysTable(this.script, this.language);
    if (!langSysTable) return;

    // Build a map of feature tag → feature records for O(1) lookup
    type FeatureRecord = (typeof gsub.featureListTable.featureRecords)[number];
    const featuresByTag = new Map<string, FeatureRecord[]>();
    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = gsub.featureListTable.featureRecords[featureIndex];
      const existing = featuresByTag.get(featureRec.featureTag);
      if (existing) {
        existing.push(featureRec);
      } else {
        featuresByTag.set(featureRec.featureTag, [featureRec]);
      }
    }

    // Apply features in the defined order
    for (const featureTag of desiredFeatures) {
      const featureRecs = featuresByTag.get(featureTag);
      if (!featureRecs) continue;

      for (const featureRec of featureRecs) {
        const featureTable = featureRec.readFeatureTable();

        for (const lookupIndex of featureTable?.lookupListIndices ?? []) {
          const lookupTable = gsub.lookupListTable.readLookupTable(lookupIndex);
          if (lookupTable === undefined) continue;
          for (let i = 0; i < lookupTable.subTableCount; i++) {
            readGsubSubtable(lookupTable, i)?.applyToGlyphRun(glyphRun, (glyphId) => this.getAdvance(glyphId));
          }
        }
      }
    }
  }

  private applyGpos(glyphRun: GlyphRun): void {
    const gpos = this.font.tables.GPOS;
    if (!gpos) return;

    const langSysTable = gpos.findLangSysTable(this.script, this.language);
    if (!langSysTable) return;

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = gpos.featureListTable.featureRecords[featureIndex];
      if (!DEFAULT_GPOS_FEATURES.includes(featureRec.featureTag)) {
        continue;
      }

      const featureTable = featureRec.readFeatureTable();

      for (const lookupIndex of featureTable?.lookupListIndices ?? []) {
        const lookupTable = gpos.lookupListTable.readLookupTable(lookupIndex);
        if (lookupTable === undefined) continue;
        for (let i = 0; i < lookupTable.subTableCount; i++) {
          readGposSubtable(lookupTable, i)?.applyToGlyphRun(glyphRun);
        }
      }
    }
  }
}
