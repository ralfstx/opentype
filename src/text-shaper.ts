import { type Font } from './font.ts';
import { type GlyphRun } from './glyph-run.ts';
import { type LangSysTable } from './tables/common/script-list.ts';
import { type GposSubtable, type GposTable, readGposSubtable } from './tables/gpos.ts';
import { type GsubSubtable, type GsubTable, readGsubSubtable } from './tables/gsub.ts';

/**
 * Default GSUB features applied automatically, in recommended order.
 * 1. `locl` before everything else
 * 2. `ccmp` before ligatures and stylistic features
 * 3. `rlig` before `liga`
 * 4. `calt` before or after `liga` depending on font, but consistently
 * 5. Everything else is usually safe after ligatures.
 */
const DEFAULT_GSUB_FEATURES = ['locl', 'ccmp', 'rlig', 'liga', 'clig', 'calt'];

/**
 * Default GPOS features applied automatically, in recommended order.
 * 1. `mark` and `mkmk` must come before kerning
 * 2. Almost everything else can come after
 */
const DEFAULT_GPOS_FEATURES = ['mark', 'mkmk', 'kern'];

const DEFAULT_FEATURES = Object.fromEntries(
  DEFAULT_GSUB_FEATURES.concat(DEFAULT_GPOS_FEATURES).map((feature) => [feature, true]),
);

/**
 * Options for text shaping.
 */
export type ShapeOptions = {
  /**
   * The OpenType script tag (e.g., 'latn' for Latin, 'arab' for Arabic).
   * If not specified, or if the specified script is not found in the font,
   * the 'DFLT' script will be used if available.
   *
   * See the OpenType specification for a list of script tags:
   * https://learn.microsoft.com/en-us/typography/opentype/spec/scripttags
   */
  scriptTag?: string;

  /**
   * The OpenType language system tag (e.g., 'ENG' for English, 'DEU' for German).
   * If not specified, or if the specified language is not found in the font,
   * the default language for the script will be used.
   *
   * See the OpenType specification for a list of language system tags:
   * https://learn.microsoft.com/en-us/typography/opentype/spec/languagetags
   */
  langSysTag?: string;

  /**
   * Whether to enable the default font features (ligatures and kerning).
   * Defaults to `true`.
   * To disable all default features, set this to `false`.
   *
   * Example:
   * ```typescript
   * const glyphRun = shaper.shape('Difficult Waffle', { defaultFeatures: false });
   * ```
   */
  defaultFeatures?: boolean;

  /**
   * Font features to apply beyond the defaults.
   * To enable additional features, set them to `true`.
   * To disable specific default features, set them to `false`.
   *
   * Example:
   * ```typescript
   * const glyphRun = shaper.shape('Difficult Waffle', {
   *   features: {
   *     'smcp': true, // Enable small caps
   *     'ss01': true, // Enable stylistic set 1
   *   },
   * });
   * ```
   */
  features?: Record<string, boolean>;
};

/**
 * Performs text shaping using OpenType GSUB and GPOS tables.
 *
 * Text shaping converts a Unicode string into a sequence of positioned
 * glyphs. This includes:
 * - Character to glyph mapping (via cmap)
 * - Glyph substitution (GSUB): ligatures, contextual alternates, etc.
 * - Glyph positioning (GPOS): kerning adjustments, mark positioning, etc.
 *
 * Example:
 * ```typescript
 * const shaper = new TextShaper(font, { scriptTag: 'latn', langSysTag: 'ENG' });
 * const glyphRun = shaper.shape('Difficult Waffle');
 * ```
 */
export class TextShaper {
  private readonly defaultOptions: ShapeOptions | undefined;
  private readonly gsubTable: GsubTable | undefined;
  private readonly gposTable: GposTable | undefined;

  /** The font used for shaping. */
  readonly font: Font;

  /**
   * Creates a new TextShaper for the given font.
   *
   * @param font - The font to use for shaping.
   * @param defaultOptions - Default shaping options for all `shape()` calls.
   */
  constructor(font: Font, defaultOptions?: ShapeOptions) {
    this.font = font;
    this.defaultOptions = defaultOptions;
    this.gsubTable = this.font.tables.GSUB;
    this.gposTable = this.font.tables.GPOS;
  }

  /**
   * Shapes the given text into a GlyphRun, applying GSUB and GPOS features.
   *
   * @param text - The text to shape.
   * @param options - Shaping options to override the defaults.
   * @returns The resulting GlyphRun with substituted and positioned glyphs.
   */
  shape(text: string, options?: ShapeOptions): GlyphRun {
    const opts = { ...this.defaultOptions, ...options };
    const enableDefaultFeatures = opts.defaultFeatures ?? true;
    const effectiveFeatures = {
      ...(enableDefaultFeatures ? DEFAULT_FEATURES : {}),
      ...opts.features,
    };
    const gsubFeatures = DEFAULT_GSUB_FEATURES.filter((feature) => effectiveFeatures[feature]);
    const gposFeatures = DEFAULT_GPOS_FEATURES.filter((feature) => effectiveFeatures[feature]);
    const additionalFeatures = Object.keys(effectiveFeatures).filter(
      (feature) =>
        effectiveFeatures[feature] &&
        !DEFAULT_GSUB_FEATURES.includes(feature) &&
        !DEFAULT_GPOS_FEATURES.includes(feature),
    );

    const gsubScriptTable = this.gsubTable?.findScriptTable(opts.scriptTag);
    const gsubLangSysTable = gsubScriptTable && this.gsubTable?.findLangSysTable(gsubScriptTable, opts.langSysTag);

    const gposScriptTable = this.gposTable?.findScriptTable(opts.scriptTag);
    const gposLangSysTable = gposScriptTable && this.gposTable?.findLangSysTable(gposScriptTable, opts.langSysTag);
    const glyphRun = this.createGlyphRun(text);
    if (gsubLangSysTable) {
      this.applyGsub(glyphRun, gsubLangSysTable, [...gsubFeatures, ...additionalFeatures]);
    }
    if (gposLangSysTable) {
      this.applyGpos(glyphRun, gposLangSysTable, [...gposFeatures, ...additionalFeatures]);
    }
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

  private applyGsub(glyphRun: GlyphRun, langSysTable: LangSysTable, features: string[]): void {
    // Apply features in the defined order
    for (const featureTag of features) {
      const subTables = this.getGsubSubTablesByTag(langSysTable, featureTag);
      if (!subTables) continue;
      for (let i = 0; i < subTables.length; i++) {
        subTables[i].applyToGlyphRun(glyphRun, (glyphId) => this.getAdvance(glyphId));
      }
    }
  }

  private applyGpos(glyphRun: GlyphRun, langSysTable: LangSysTable, features: string[]): void {
    // Apply features in the defined order
    for (const featureTag of features) {
      const subTables = this.getGposSubTablesByTag(langSysTable, featureTag);
      if (!subTables) continue;
      for (let i = 0; i < subTables.length; i++) {
        subTables[i].applyToGlyphRun(glyphRun);
      }
    }
  }

  private getGsubSubTablesByTag(langSysTable: LangSysTable, featureTag: string): GsubSubtable[] | undefined {
    if (!this.gsubTable) return;

    const subTables: GsubSubtable[] = [];

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = this.gsubTable.featureListTable.featureRecords[featureIndex];
      if (featureRec.featureTag === featureTag) {
        const featureTable = featureRec.readFeatureTable();
        for (const lookupIndex of featureTable.lookupListIndices) {
          const lookupTable = this.gsubTable.lookupListTable.readLookupTable(lookupIndex);
          if (lookupTable === undefined) continue;
          for (let i = 0; i < lookupTable.subTableCount; i++) {
            const table = readGsubSubtable(lookupTable, i);
            if (table) subTables.push(table);
          }
        }
      }
    }

    return subTables;
  }

  private getGposSubTablesByTag(langSysTable: LangSysTable, featureTag: string): GposSubtable[] | undefined {
    if (!this.gposTable) return;

    const subTables: GposSubtable[] = [];

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = this.gposTable.featureListTable.featureRecords[featureIndex];
      if (featureRec.featureTag === featureTag) {
        const featureTable = featureRec.readFeatureTable();
        for (const lookupIndex of featureTable.lookupListIndices) {
          const lookupTable = this.gposTable.lookupListTable.readLookupTable(lookupIndex);
          if (lookupTable === undefined) continue;
          for (let i = 0; i < lookupTable.subTableCount; i++) {
            const table = readGposSubtable(lookupTable, i);
            if (table) subTables.push(table);
          }
        }
      }
    }

    return subTables;
  }
}
