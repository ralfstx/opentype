import { DataReader, subDataView } from '../data-reader.ts';
import { type GlyphRun, type ShapedGlyph } from '../glyph-run.ts';
import { CoverageTable } from './common/coverage.ts';
import { FeatureListTable, type FeatureTable } from './common/feature-list.ts';
import { LookupListTable, type LookupTable } from './common/lookup-list.ts';
import { type LangSysTable, ScriptListTable, type ScriptTable } from './common/script-list.ts';

/**
 * The 'GSUB' table provides glyph substitution data for advanced
 * typography features like ligatures.
 */
export class GsubTable {
  private readonly data: DataView;
  readonly scriptListTable: ScriptListTable;

  readonly featureListTable: FeatureListTable;
  readonly lookupListTable: LookupListTable;

  /**
   * Reads a 'GSUB' table from the given DataView.
   */
  static read(data: DataView) {
    return new GsubTable(data);
  }

  private constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    const majorVersion = reader.readUint16();
    if (majorVersion !== 1) {
      throw new Error(`Unsupported GSUB table version ${majorVersion}`);
    }
    const minorVersion = reader.readUint16();
    if (minorVersion !== 0 && minorVersion !== 1) {
      throw new Error(`Unsupported GSUB table version ${majorVersion}.${minorVersion}`);
    }
    const scriptListOffset = reader.readUint16();
    const featureListOffset = reader.readUint16();
    const lookupListOffset = reader.readUint16();
    if (minorVersion === 1) reader.readUint32(); // featureVariationsOffset

    this.scriptListTable = ScriptListTable.read(subDataView(this.data, scriptListOffset));
    this.featureListTable = FeatureListTable.read(subDataView(this.data, featureListOffset));
    this.lookupListTable = LookupListTable.read(subDataView(this.data, lookupListOffset));
  }

  findScriptTable(scriptTag = 'DFLT'): ScriptTable | undefined {
    const scriptRecord =
      this.scriptListTable.scriptRecords.find((record) => record.scriptTag === scriptTag) ??
      this.scriptListTable.scriptRecords.find((record) => record.scriptTag === 'DFLT');
    return scriptRecord?.readScriptTable();
  }

  findLangSysTable(scriptTable: ScriptTable, langSysTag: string | undefined): LangSysTable | undefined {
    const langSysRecord = langSysTag
      ? scriptTable.langSysRecords.find((record) => record.langSysTag === langSysTag)
      : undefined;
    return langSysRecord?.readLangSysTable() ?? scriptTable.defaultLangSysTable;
  }

  findFeatureTables(featureTag: string): FeatureTable[] {
    const featureRecords = this.featureListTable.featureRecords.filter((record) => record.featureTag === featureTag);
    return featureRecords.map((rec) => rec.readFeatureTable());
  }
}

// === SUBTABLES ===

export function readGsubSubtable(lookupTable: LookupTable, subtableIndex: number): GsubSubtable | undefined {
  if (lookupTable.lookupType === 1) {
    return GsubSingleSubstSubtable.read(lookupTable.getSubTableData(subtableIndex));
  }
  if (lookupTable.lookupType === 4) {
    return GsubLigatureSubstSubtable.read(lookupTable.getSubTableData(subtableIndex));
  }
}

export type GsubSubtable = GsubSingleSubstSubtable | GsubLigatureSubstSubtable;

/**
 * Lookup type 1 subtable: single substitution (one glyph → one glyph)
 * Used for features like small caps (smcp), stylistic alternates, etc.
 */
export class GsubSingleSubstSubtable {
  private readonly isFormat1: boolean;
  private readonly deltaGlyphId: number;
  private readonly substituteGlyphIds: number[];
  readonly coverageTable: CoverageTable;

  static read(data: DataView): GsubSingleSubstSubtable {
    return new GsubSingleSubstSubtable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const format = reader.readUint16();
    if (format !== 1 && format !== 2) {
      throw new Error(`Unsupported GSUB single subst subtable format ${format}`);
    }
    this.isFormat1 = format === 1;

    const coverageOffset = reader.readUint16();

    if (this.isFormat1) {
      // Format 1: Add delta to glyph ID
      this.deltaGlyphId = reader.readInt16();
      this.substituteGlyphIds = [];
    } else {
      // Format 2: Explicit substitute glyph array
      this.deltaGlyphId = 0;
      const glyphCount = reader.readUint16();
      this.substituteGlyphIds = Array.from({ length: glyphCount }, () => reader.readUint16());
    }

    this.coverageTable = CoverageTable.read(subDataView(data, coverageOffset));
  }

  /**
   * Applies single substitution to the given glyph sequence.
   * For performance reasons, the glyph sequence is modified in place.
   */
  applyToGlyphRun(
    glyphRun: GlyphRun,
    getAdvance?: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
  ): void {
    for (const glyph of glyphRun.glyphs) {
      if (skip?.(glyph.glyphId)) continue;
      const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
      if (coverageIndex === -1) continue;

      if (this.isFormat1) {
        // Format 1: Add delta to get substitute glyph ID
        glyph.glyphId = (glyph.glyphId + this.deltaGlyphId) & 0xffff;
      } else {
        // Format 2: Look up substitute glyph ID
        const substituteGlyphId = this.substituteGlyphIds[coverageIndex];
        if (substituteGlyphId !== undefined) {
          glyph.glyphId = substituteGlyphId;
        }
      }

      // Update advance for the new glyph
      if (getAdvance) {
        glyph.advance = getAdvance(glyph.glyphId);
      }
    }
  }
}

export class GsubLigatureSubstSubtable {
  private readonly data: DataView;
  private readonly ligatureSetCount: number;
  private readonly ligatureSetOffsets: number[];
  coverageTable: CoverageTable;
  ligatureSets: LigatureSetTable[];

  static read(data: DataView): GsubLigatureSubstSubtable {
    return new GsubLigatureSubstSubtable(data);
  }

  private constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);

    if (reader.readUint16() !== 1) {
      throw new Error('ligatureSubstFormat should be 1');
    }
    const coverageOffset = reader.readUint16();
    this.ligatureSetCount = reader.readUint16();
    this.ligatureSetOffsets = Array.from({ length: this.ligatureSetCount }, () => reader.readUint16());

    this.coverageTable = CoverageTable.read(subDataView(this.data, coverageOffset));
    this.ligatureSets = Array.from({ length: this.ligatureSetCount }, (_, index) => {
      return new LigatureSetTable(subDataView(this.data, this.ligatureSetOffsets[index]));
    });
  }

  /**
   * Applies the ligature substitution to the given glyph sequence.
   * For performance reasons, the glyph sequence is modified in place.
   *
   * The ligature glyph combines the codePoints from all replaced glyphs.
   * If a getAdvance callback is provided, it is used to set the ligature's
   * advance; otherwise the advance defaults to 0.
   */
  applyToGlyphRun(
    glyphRun: GlyphRun,
    getAdvance?: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
  ): void {
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      const startGlyph = glyphRun.glyphs[i];
      if (skip?.(startGlyph.glyphId)) continue;

      const coverageIndex = this.coverageTable.lookupGlyphId(startGlyph.glyphId);

      if (coverageIndex !== -1) {
        const ligatureSetTable = this.ligatureSets[coverageIndex];

        // Try to match the longest possible ligature
        for (const ligatureTable of ligatureSetTable.ligatureTables) {
          // Collect matching component glyphs, skipping filtered glyphs
          const matchIndices = matchLigatureComponents(glyphRun, i, ligatureTable.compGlyphIDs, skip);
          if (!matchIndices) continue;

          // Collect codePoints from all glyphs being replaced
          const replaceIndices = [i, ...matchIndices];
          const codePoints: number[] = [];
          for (const idx of replaceIndices) {
            codePoints.push(...glyphRun.glyphs[idx].codePoints);
          }
          const ligatureGlyph: ShapedGlyph = {
            glyphId: ligatureTable.ligGlyph,
            codePoints,
            advance: getAdvance?.(ligatureTable.ligGlyph) ?? 0,
          };
          // Remove matched glyphs in reverse order, then insert ligature
          for (let k = matchIndices.length - 1; k >= 0; k--) {
            glyphRun.glyphs.splice(matchIndices[k], 1);
          }
          glyphRun.glyphs.splice(i, 1, ligatureGlyph);
          break;
        }
      }
    }
  }
}

class LigatureSetTable {
  readonly ligatureTables: LigatureTable[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    const ligatureCount = reader.readUint16();
    const ligatureOffsets = Array.from({ length: ligatureCount }, () => reader.readUint16());
    this.ligatureTables = ligatureOffsets.map((offset) => {
      return new LigatureTable(subDataView(data, offset));
    });
  }
}

class LigatureTable {
  readonly ligGlyph: number;
  readonly compGlyphIDs: number[];

  constructor(data: DataView) {
    const reader = new DataReader(data);

    this.ligGlyph = reader.readUint16();
    const compCount = reader.readUint16();
    this.compGlyphIDs = Array.from({ length: compCount - 1 }, () => reader.readUint16());
  }
}

/**
 * Matches ligature component glyphs starting after position `startIndex`,
 * skipping glyphs that should be filtered. Returns the indices of the
 * matched glyphs, or undefined if the match fails.
 */
function matchLigatureComponents(
  glyphRun: GlyphRun,
  startIndex: number,
  compGlyphIDs: number[],
  skip?: (glyphId: number) => boolean,
): number[] | undefined {
  const indices: number[] = [];
  let compIdx = 0;
  for (let j = startIndex + 1; j < glyphRun.glyphs.length && compIdx < compGlyphIDs.length; j++) {
    if (skip?.(glyphRun.glyphs[j].glyphId)) continue;
    if (glyphRun.glyphs[j].glyphId !== compGlyphIDs[compIdx]) return undefined;
    indices.push(j);
    compIdx++;
  }
  return compIdx === compGlyphIDs.length ? indices : undefined;
}
