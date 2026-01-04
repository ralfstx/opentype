import { type Font } from './font.ts';
import { type GlyphRun } from './glyph-run.ts';
import { type FeatureRecord } from './tables/common/feature-list.ts';
import { type LookupListTable, type LookupTable } from './tables/common/lookup-list.ts';
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
 * - Glyph positioning (GPOS): kerning adjustments
 *
 * Example:
 * ```typescript
 * const shaper = new TextShaper(font, 'latn', 'en');
 * const glyphRun = shaper.shape('Difficult Waffle');
 * ```
 */
export class TextShaper {
  private readonly gsubTable: GsubTable | undefined;
  private readonly gsubLangSysTable: LangSysTable | undefined;
  private gsubFeatureRecordsByTag: Map<string, FeatureRecord[]> | undefined;
  private gsubSubTablesByTag: Map<string, GsubSubtable[]> | undefined;

  private readonly gposTable: GposTable | undefined;
  private readonly gposLangSysTable: LangSysTable | undefined;
  private gposFeatureRecordsByTag: Map<string, FeatureRecord[]> | undefined;
  private gposSubTablesByTag: Map<string, GposSubtable[]> | undefined;

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

    this.gsubTable = this.font.tables.GSUB;
    this.gsubLangSysTable = this.gsubTable?.findLangSysTable(this.script, this.language);

    this.gposTable = this.font.tables.GPOS;
    this.gposLangSysTable = this.gposTable?.findLangSysTable(this.script, this.language);
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
    const enableDefaultFeatures = options?.defaultFeatures ?? true;
    const effectiveFeatures = {
      ...(enableDefaultFeatures ? DEFAULT_FEATURES : {}),
      ...options?.features,
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
    this.applyGsub(glyphRun, [...gsubFeatures, ...additionalFeatures]);
    this.applyGpos(glyphRun, [...gposFeatures, ...additionalFeatures]);
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

  private applyGsub(glyphRun: GlyphRun, features: string[]): void {
    if (!this.gsubTable || !this.gsubLangSysTable) return;

    // Apply features in the defined order
    for (const featureTag of features) {
      const subTables = this.getGsubSubTablesByTag(featureTag);
      if (!subTables) continue;
      for (let i = 0; i < subTables.length; i++) {
        subTables[i].applyToGlyphRun(glyphRun, (glyphId) => this.getAdvance(glyphId));
      }
    }
  }

  private applyGpos(glyphRun: GlyphRun, features: string[]): void {
    if (!this.gposTable) return;
    if (!this.gposLangSysTable) return;

    // Apply features in the defined order
    for (const featureTag of features) {
      const subTables = this.getGposSubTablesByTag(featureTag);
      if (!subTables) continue;
      for (let i = 0; i < subTables.length; i++) {
        subTables[i].applyToGlyphRun(glyphRun);
      }
    }
  }

  private getGsubSubTablesByTag(featureTag: string): GsubSubtable[] | undefined {
    if (!this.gsubTable || !this.gsubLangSysTable) return;
    this.gsubSubTablesByTag ??= new Map<string, GsubSubtable[]>();

    const existing = this.gsubSubTablesByTag.get(featureTag);
    if (existing) return existing;

    this.gsubFeatureRecordsByTag ??= getFeatureRecordsByTag(this.gsubTable, this.gsubLangSysTable);
    const featureRecords = this.gsubFeatureRecordsByTag?.get(featureTag);
    if (!featureRecords) return [];

    const subTables = readSubTables(featureRecords, this.gsubTable.lookupListTable, readGsubSubtable) ?? [];
    this.gsubSubTablesByTag.set(featureTag, subTables);
    return subTables;
  }

  private getGposSubTablesByTag(featureTag: string): GposSubtable[] | undefined {
    if (!this.gposTable || !this.gposLangSysTable) return;
    this.gposSubTablesByTag ??= new Map<string, GposSubtable[]>();

    const existing = this.gposSubTablesByTag.get(featureTag);
    if (existing) return existing;

    this.gposFeatureRecordsByTag ??= getFeatureRecordsByTag(this.gposTable, this.gposLangSysTable)!;
    const featureRecs = this.gposFeatureRecordsByTag?.get(featureTag);
    if (!featureRecs) return [];

    const subTables = readSubTables(featureRecs ?? [], this.gposTable.lookupListTable, readGposSubtable) ?? [];
    this.gposSubTablesByTag.set(featureTag, subTables);
    return subTables;
  }
}

function getFeatureRecordsByTag(
  table: GsubTable | GposTable,
  langSysTable: LangSysTable,
): Map<string, FeatureRecord[]> | undefined {
  const featuresByTag = new Map<string, FeatureRecord[]>();

  for (const featureIndex of langSysTable.featureIndices) {
    const featureRec = table.featureListTable.featureRecords[featureIndex];
    const existing = featuresByTag.get(featureRec.featureTag);
    if (existing) {
      existing.push(featureRec);
    } else {
      featuresByTag.set(featureRec.featureTag, [featureRec]);
    }
  }

  return featuresByTag;
}

function readSubTables<T extends GsubSubtable | GposSubtable>(
  featureRecs: FeatureRecord[],
  lookupListTable: LookupListTable,
  readSubtable: (lookupTable: LookupTable, index: number) => T | undefined,
): T[] | undefined {
  const subTables: T[] = [];

  for (const featureRec of featureRecs) {
    const featureTable = featureRec.readFeatureTable();

    for (const lookupIndex of featureTable?.lookupListIndices ?? []) {
      const lookupTable = lookupListTable.readLookupTable(lookupIndex);
      if (lookupTable === undefined) continue;
      for (let i = 0; i < lookupTable.subTableCount; i++) {
        const table = readSubtable(lookupTable, i);
        if (table) subTables.push(table);
      }
    }
  }

  return subTables;
}
