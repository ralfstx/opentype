import { type Font } from './font.ts';
import { type GlyphRun } from './glyph-run.ts';
import { GposProcessor, GsubProcessor } from './layout-processors.ts';
import { type GdefTable, GlyphClass } from './tables/gdef.ts';
import { type HmtxTable } from './tables/hmtx.ts';
import { type KernTable } from './tables/kern.ts';

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
  private readonly hmtxTable: HmtxTable;
  private readonly gsubProcessor: GsubProcessor | undefined;
  private readonly gposProcessor: GposProcessor | undefined;
  private readonly kernTable: KernTable | undefined;
  private readonly gdefTable: GdefTable | undefined;
  private readonly gposHasKernCache = new Map<string, boolean>();

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
    const hmtxTable = this.font.tables.hmtx;
    const gsubTable = this.font.tables.GSUB;
    const gposTable = this.font.tables.GPOS;
    if (!hmtxTable) {
      throw new Error('Font is missing required hmtx table for text shaping.');
    }
    this.hmtxTable = hmtxTable;
    const gdefTable = this.font.tables.GDEF;
    this.gdefTable = gdefTable;
    if (gsubTable) {
      this.gsubProcessor = new GsubProcessor(gsubTable, hmtxTable, gdefTable);
    }
    if (gposTable) {
      this.gposProcessor = new GposProcessor(gposTable, gdefTable);
    }
    this.kernTable = this.font.tables.kern;
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

    const glyphRun = this.createGlyphRun(text);
    const layoutOpts = {
      scriptTag: opts.scriptTag !== undefined ? padTag(opts.scriptTag, 'scriptTag') : undefined,
      langSysTag: opts.langSysTag !== undefined ? padTag(opts.langSysTag, 'langSysTag') : undefined,
    };
    this.gsubProcessor?.apply(glyphRun, [...gsubFeatures, ...additionalFeatures], layoutOpts);
    const markAttachments =
      this.gposProcessor?.apply(glyphRun, [...gposFeatures, ...additionalFeatures], layoutOpts) ??
      new Map<number, number>();

    // Apply legacy kern table as fallback when GPOS has no kern feature
    // TODO: legacy kern must not be applied to variable fonts, ensure when these are supported
    if (this.kernTable && effectiveFeatures.kern && !this.gposHasKern(layoutOpts)) {
      this.kernTable.applyToGlyphRun(glyphRun);
    }

    if (this.gdefTable) {
      zeroMarkAdvances(glyphRun, this.gdefTable, !this.gposProcessor);
    }
    resolveMarkAttachments(glyphRun, markAttachments);

    return glyphRun;
  }

  private gposHasKern(options: { scriptTag?: string; langSysTag?: string }): boolean {
    if (!this.gposProcessor) return false;
    const key = `${options.scriptTag ?? ''}\0${options.langSysTag ?? ''}`;
    let result = this.gposHasKernCache.get(key);
    if (result === undefined) {
      result = this.gposProcessor.hasFeature('kern', options);
      this.gposHasKernCache.set(key, result);
    }
    return result;
  }

  private createGlyphRun(text: string): GlyphRun {
    const glyphMapping = this.font.glyphMapping;

    // Spread iterates over Unicode code points, correctly handling surrogate pairs
    const glyphs = [...text].map((s) => {
      const codePoint = s.codePointAt(0)!;
      // By OpenType convention, glyph ID 0 is reserved for the .notdef glyph
      const glyphId = glyphMapping.get(codePoint) ?? 0;
      const advance = this.hmtxTable.getMetric(glyphId)?.advanceWidth ?? 0;
      return { glyphId, codePoints: [codePoint], advance };
    });

    return { glyphs };
  }
}

const TAG_PATTERN = /^[A-Za-z0-9]+ *$/;

function padTag(tag: string, name: string): string {
  if (!TAG_PATTERN.test(tag)) {
    throw new Error(`Invalid ${name}: '${tag}'. Must be ASCII alphanumeric characters with optional trailing spaces.`);
  }
  if (tag.length < 1 || tag.length > 4) {
    throw new Error(`Invalid ${name}: '${tag}'. Must be 1–4 characters.`);
  }
  return tag.padEnd(4, ' ');
}

/**
 * Sets the advance of mark glyphs, as classified by the GDEF table, to
 * zero, like other shaping engines do. This happens after all positioning
 * lookups, so it also discards adjustments that these applied to marks.
 * Without GPOS, the marks are moved back by their former advance, so that
 * they remain over the preceding glyph.
 */
export function zeroMarkAdvances(glyphRun: GlyphRun, gdefTable: GdefTable, adjustOffsets: boolean): void {
  for (const glyph of glyphRun.glyphs) {
    if (gdefTable.getGlyphClass(glyph.glyphId) !== GlyphClass.Mark) continue;
    if (adjustOffsets) {
      glyph.xOffset = (glyph.xOffset ?? 0) - glyph.advance - (glyph.advanceAdjust ?? 0);
    }
    glyph.advance = 0;
    delete glyph.advanceAdjust;
  }
}

/**
 * Converts horizontal mark attachment offsets from relative to the origin
 * of the attached-to glyph to relative to the mark's own pen position.
 * Marks also move along with the horizontal offset of the glyph they are
 * attached to. Vertical offsets are already final, see `attachMark()`.
 * Must be called after all GPOS lookups have been applied, so that
 * accumulated advances include all adjustments.
 */
export function resolveMarkAttachments(glyphRun: GlyphRun, markAttachments: Map<number, number>): void {
  const { glyphs } = glyphRun;
  // Marks always attach to a preceding glyph. Resolving in ascending order
  // ensures that a mark attached to another mark sees its final offset.
  const markIndices = [...markAttachments.keys()].sort((a, b) => a - b);
  for (const markIndex of markIndices) {
    const targetIndex = markAttachments.get(markIndex)!;
    const glyph = glyphs[markIndex];
    const target = glyphs[targetIndex];

    // Subtract accumulated advance from target (inclusive) to mark (exclusive)
    let accumulatedAdvance = 0;
    for (let j = targetIndex; j < markIndex; j++) {
      accumulatedAdvance += glyphs[j].advance + (glyphs[j].advanceAdjust ?? 0);
    }
    glyph.xOffset = (glyph.xOffset ?? 0) + (target.xOffset ?? 0) - accumulatedAdvance;
  }
}
