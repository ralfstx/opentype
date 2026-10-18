import { DataReader, subDataView } from '../data-reader.ts';
import { type GlyphRun, type ShapedGlyph } from '../glyph-run.ts';
import { type ContextRule, readChainingContextRules, readContextRules } from './common/context.ts';
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
  const lookupType = lookupTable.lookupType;
  const data = lookupTable.getSubTableData(subtableIndex);
  return readGsubSubtableByType(lookupType, data);
}

function readGsubSubtableByType(lookupType: number, data: DataView): GsubSubtable | undefined {
  if (lookupType === 1) {
    return GsubSingleSubstSubtable.read(data);
  }
  if (lookupType === 2) {
    return GsubMultipleSubstSubtable.read(data);
  }
  if (lookupType === 3) {
    return GsubAlternateSubstSubtable.read(data);
  }
  if (lookupType === 4) {
    return GsubLigatureSubstSubtable.read(data);
  }
  if (lookupType === 5) {
    return GsubContextSubstSubtable.read(data);
  }
  if (lookupType === 6) {
    return GsubChainingContextSubstSubtable.read(data);
  }
  if (lookupType === 7) {
    const { extensionLookupType, extensionData } = readExtensionSubtable(data);
    if (extensionLookupType === 7) {
      throw new Error('GSUB extension subtable must not reference another extension');
    }
    return readGsubSubtableByType(extensionLookupType, extensionData);
  }
}

/**
 * Reads the extension subtable header (Type 7) and returns the inner
 * subtable's lookup type and DataView. The extension format uses a 32-bit
 * offset to allow subtable data beyond the 64KB limit of 16-bit offsets.
 */
function readExtensionSubtable(data: DataView): { extensionLookupType: number; extensionData: DataView } {
  const reader = new DataReader(data);
  const format = reader.readUint16();
  if (format !== 1) {
    throw new Error(`Unsupported GSUB extension subtable format ${format}`);
  }
  const extensionLookupType = reader.readUint16();
  const extensionOffset = reader.readUint32();
  return { extensionLookupType, extensionData: subDataView(data, extensionOffset) };
}

/**
 * Callback to apply an inner GSUB lookup at a specific glyph position.
 * Used by contextual substitution (Types 5 and 6) to invoke referenced lookups.
 */
export type ApplyLookupFn = (
  lookupIndex: number,
  glyphRun: GlyphRun,
  targetIndex: number,
  getAdvance: (glyphId: number) => number,
) => void;

export type GsubSubtable =
  | GsubSingleSubstSubtable
  | GsubMultipleSubstSubtable
  | GsubAlternateSubstSubtable
  | GsubLigatureSubstSubtable
  | GsubContextSubstSubtable
  | GsubChainingContextSubstSubtable;

/**
 * Tries to apply a list of GSUB subtables at a specific glyph position.
 * Subtables are tried in order; the first one that applies wins.
 * Returns the position to continue at, or undefined if no subtable
 * applied.
 */
export function applyGsubSubtablesAtIndex(
  subtables: GsubSubtable[],
  glyphRun: GlyphRun,
  index: number,
  getAdvance: (glyphId: number) => number,
  skip: ((glyphId: number) => boolean) | undefined,
  applyLookup: ApplyLookupFn,
): number | undefined {
  for (const subtable of subtables) {
    const next = subtable.applyAtIndex(glyphRun, index, getAdvance, skip, applyLookup);
    if (next !== undefined) return next;
  }
  return undefined;
}

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
    _applyLookup?: ApplyLookupFn,
  ): void {
    const advance = getAdvance ?? (() => 0);
    for (let i = 0; i < glyphRun.glyphs.length;) {
      i = this.applyAtIndex(glyphRun, i, advance, skip) ?? i + 1;
    }
  }

  /**
   * Tries to apply single substitution at a specific glyph position.
   * Returns the position to continue at, or undefined if not applied.
   */
  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    _applyLookup?: ApplyLookupFn,
  ): number | undefined {
    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return undefined;

    const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
    if (coverageIndex === -1) return undefined;

    if (this.isFormat1) {
      glyph.glyphId = (glyph.glyphId + this.deltaGlyphId) & 0xffff;
    } else {
      const substituteGlyphId = this.substituteGlyphIds[coverageIndex];
      if (substituteGlyphId === undefined) return undefined;
      glyph.glyphId = substituteGlyphId;
    }

    glyph.advance = getAdvance(glyph.glyphId);
    return index + 1;
  }
}

/**
 * Lookup type 2 subtable: multiple substitution (one glyph → many glyphs)
 * Used for decomposition, e.g., ﬁ → f + i for accessibility.
 */
export class GsubMultipleSubstSubtable {
  private readonly sequences: number[][];
  readonly coverageTable: CoverageTable;

  static read(data: DataView): GsubMultipleSubstSubtable {
    return new GsubMultipleSubstSubtable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const format = reader.readUint16();
    if (format !== 1) {
      throw new Error(`Unsupported GSUB multiple subst subtable format ${format}`);
    }

    const coverageOffset = reader.readUint16();
    const sequenceCount = reader.readUint16();
    const sequenceOffsets = Array.from({ length: sequenceCount }, () => reader.readUint16());

    this.coverageTable = CoverageTable.read(subDataView(data, coverageOffset));
    this.sequences = sequenceOffsets.map((offset) => {
      const seqReader = new DataReader(subDataView(data, offset));
      const substituteCount = seqReader.readUint16();
      return Array.from({ length: substituteCount }, () => seqReader.readUint16());
    });
  }

  applyToGlyphRun(
    glyphRun: GlyphRun,
    getAdvance?: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    _applyLookup?: ApplyLookupFn,
  ): void {
    const advance = getAdvance ?? (() => 0);
    for (let i = 0; i < glyphRun.glyphs.length;) {
      i = this.applyAtIndex(glyphRun, i, advance, skip) ?? i + 1;
    }
  }

  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    _applyLookup?: ApplyLookupFn,
  ): number | undefined {
    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return undefined;

    const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
    if (coverageIndex === -1) return undefined;

    const sequence = this.sequences[coverageIndex];
    if (!sequence) return undefined;

    if (sequence.length === 0) {
      // Deletion: remove the glyph entirely, the next glyph moves here
      glyphRun.glyphs.splice(index, 1);
      return index;
    }

    // Replace the original glyph with the substitute sequence
    const codePoints = glyph.codePoints;
    const newGlyphs: ShapedGlyph[] = sequence.map((glyphId, i) => ({
      glyphId,
      codePoints: i === 0 ? codePoints : [],
      advance: getAdvance(glyphId),
    }));
    glyphRun.glyphs.splice(index, 1, ...newGlyphs);
    return index + newGlyphs.length;
  }
}

/**
 * Lookup type 3 subtable: alternate substitution (one glyph → one of several alternates)
 * Used for features like stylistic alternates (salt), stylistic sets (ss01–ss20), etc.
 */
export class GsubAlternateSubstSubtable {
  private readonly alternates: number[][];
  readonly coverageTable: CoverageTable;

  static read(data: DataView): GsubAlternateSubstSubtable {
    return new GsubAlternateSubstSubtable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);

    const format = reader.readUint16();
    if (format !== 1) {
      throw new Error(`Unsupported GSUB alternate subst subtable format ${format}`);
    }

    const coverageOffset = reader.readUint16();
    const alternateSetCount = reader.readUint16();
    const alternateSetOffsets = Array.from({ length: alternateSetCount }, () => reader.readUint16());

    this.coverageTable = CoverageTable.read(subDataView(data, coverageOffset));
    this.alternates = alternateSetOffsets.map((offset) => {
      const setReader = new DataReader(subDataView(data, offset));
      const alternateCount = setReader.readUint16();
      return Array.from({ length: alternateCount }, () => setReader.readUint16());
    });
  }

  applyToGlyphRun(
    glyphRun: GlyphRun,
    getAdvance?: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
  ): void {
    const advance = getAdvance ?? (() => 0);
    for (let i = 0; i < glyphRun.glyphs.length;) {
      i = this.applyAtIndex(glyphRun, i, advance, skip) ?? i + 1;
    }
  }

  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
  ): number | undefined {
    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return undefined;

    const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
    if (coverageIndex === -1) return undefined;

    const alternateSet = this.alternates[coverageIndex];
    if (!alternateSet || alternateSet.length === 0) return undefined;

    // Always select the first alternate (index 0), which is the standard
    // behavior for non-interactive shapers. The spec allows a user-selected
    // alternate index, but that requires UI interaction.
    glyph.glyphId = alternateSet[0];
    glyph.advance = getAdvance(glyph.glyphId);
    return index + 1;
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
    _applyLookup?: ApplyLookupFn,
  ): void {
    const advance = getAdvance ?? (() => 0);
    for (let i = 0; i < glyphRun.glyphs.length;) {
      i = this.applyAtIndex(glyphRun, i, advance, skip) ?? i + 1;
    }
  }

  /**
   * Tries to form a ligature starting at the given glyph position, the
   * glyphs are spliced in place. Returns the position after the ligature,
   * or undefined if no ligature was formed.
   */
  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    _applyLookup?: ApplyLookupFn,
  ): number | undefined {
    const startGlyph = glyphRun.glyphs[index];
    if (!startGlyph || skip?.(startGlyph.glyphId)) return undefined;

    const coverageIndex = this.coverageTable.lookupGlyphId(startGlyph.glyphId);
    if (coverageIndex === -1) return undefined;

    const ligatureSetTable = this.ligatureSets[coverageIndex];

    // Try to match the longest possible ligature
    for (const ligatureTable of ligatureSetTable.ligatureTables) {
      const matchIndices = matchLigatureComponents(glyphRun, index, ligatureTable.compGlyphIDs, skip);
      if (!matchIndices) continue;

      // Collect codePoints from all glyphs being replaced
      const replaceIndices = [index, ...matchIndices];
      const codePoints: number[] = [];
      for (const idx of replaceIndices) {
        codePoints.push(...glyphRun.glyphs[idx].codePoints);
      }
      const ligatureGlyph: ShapedGlyph = {
        glyphId: ligatureTable.ligGlyph,
        codePoints,
        advance: getAdvance(ligatureTable.ligGlyph),
      };
      // Remove matched glyphs in reverse order, then insert ligature
      for (let k = matchIndices.length - 1; k >= 0; k--) {
        glyphRun.glyphs.splice(matchIndices[k], 1);
      }
      glyphRun.glyphs.splice(index, 1, ligatureGlyph);
      return index + 1;
    }

    return undefined;
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

// === Context Substitution (Type 5) ===

/**
 * Lookup type 5 subtable: context substitution.
 * Matches an input sequence of glyphs and applies referenced inner lookups
 * to specific positions within that sequence. Unlike Type 6 (chaining
 * contextual), there are no backtrack or lookahead contexts.
 *
 * Supports all three formats:
 * - Format 1: glyph-based rules (coverage + explicit glyph ID sequences)
 * - Format 2: class-based rules (coverage + ClassDef + class sequences)
 * - Format 3: coverage-based rules (per-position coverage tables)
 */
export class GsubContextSubstSubtable {
  private readonly rules: ContextRule[];

  static read(data: DataView): GsubContextSubstSubtable | undefined {
    const rules = readContextRules(data);
    return rules.length > 0 ? new GsubContextSubstSubtable(rules) : undefined;
  }

  private constructor(rules: ContextRule[]) {
    this.rules = rules;
  }

  applyToGlyphRun(
    glyphRun: GlyphRun,
    getAdvance?: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    applyLookup?: ApplyLookupFn,
  ): void {
    if (!applyLookup || !getAdvance) return;

    for (let i = 0; i < glyphRun.glyphs.length;) {
      i = this.applyAtIndex(glyphRun, i, getAdvance, skip, applyLookup) ?? i + 1;
    }
  }

  /**
   * Tries to match a rule at the given glyph position and applies the
   * referenced lookups. Returns the position after the matched input
   * sequence, where processing continues, or undefined if no rule matched.
   */
  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    applyLookup?: ApplyLookupFn,
  ): number | undefined {
    if (!applyLookup) return undefined;
    return applyContextRules(this.rules, glyphRun, index, getAdvance, skip, applyLookup);
  }
}

// === Chaining Contextual Substitution (Type 6) ===

/**
 * Lookup type 6 subtable: chaining contextual substitution.
 * Matches a sequence of glyphs with backtrack, input, and lookahead
 * contexts, then applies referenced inner lookups to specific input glyphs.
 *
 * Supports all three formats:
 * - Format 1: glyph-based rules (coverage + explicit glyph ID sequences)
 * - Format 2: class-based rules (coverage + ClassDefs + class sequences)
 * - Format 3: coverage-based rules (per-position coverage tables)
 */
export class GsubChainingContextSubstSubtable {
  private readonly rules: ContextRule[];

  static read(data: DataView): GsubChainingContextSubstSubtable | undefined {
    const rules = readChainingContextRules(data);
    return rules.length > 0 ? new GsubChainingContextSubstSubtable(rules) : undefined;
  }

  private constructor(rules: ContextRule[]) {
    this.rules = rules;
  }

  applyToGlyphRun(
    glyphRun: GlyphRun,
    getAdvance?: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    applyLookup?: ApplyLookupFn,
  ): void {
    if (!applyLookup || !getAdvance) return;

    for (let i = 0; i < glyphRun.glyphs.length;) {
      i = this.applyAtIndex(glyphRun, i, getAdvance, skip, applyLookup) ?? i + 1;
    }
  }

  /**
   * Tries to match a rule at the given glyph position and applies the
   * referenced lookups. Returns the position after the matched input
   * sequence, where processing continues, or undefined if no rule matched.
   */
  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    applyLookup?: ApplyLookupFn,
  ): number | undefined {
    if (!applyLookup) return undefined;
    return applyContextRules(this.rules, glyphRun, index, getAdvance, skip, applyLookup);
  }
}

/**
 * Applies the first rule that matches at the given glyph position. Returns
 * the position after the matched input sequence, or undefined if no rule
 * matched.
 */
function applyContextRules(
  rules: ContextRule[],
  glyphRun: GlyphRun,
  index: number,
  getAdvance: (glyphId: number) => number,
  skip: ((glyphId: number) => boolean) | undefined,
  applyLookup: ApplyLookupFn,
): number | undefined {
  const glyph = glyphRun.glyphs[index];
  if (!glyph || skip?.(glyph.glyphId)) return undefined;

  for (const rule of rules) {
    const inputIndices = rule.matchInputAt(glyphRun, index, skip);
    if (!inputIndices) continue;

    const indices = inputIndices.slice();
    let end = inputIndices[inputIndices.length - 1] + 1;
    for (const record of rule.lookupRecords) {
      const targetIndex = indices[record.glyphSequenceIndex];
      if (targetIndex === undefined || targetIndex < 0) continue;
      const before = glyphRun.glyphs.length;
      applyLookup(record.lookupListIndex, glyphRun, targetIndex, getAdvance);
      const delta = glyphRun.glyphs.length - before;
      if (delta !== 0) {
        // Invalidate the operated position — the glyph was deleted,
        // expanded, or collapsed, so re-targeting it would be wrong.
        indices[record.glyphSequenceIndex] = -1;
        for (let j = 0; j < indices.length; j++) {
          if (indices[j] > targetIndex) indices[j] += delta;
        }
        // A ligature may also consume glyphs after the input sequence, so
        // the end cannot move before the operated position (like HarfBuzz)
        end = Math.max(end + delta, targetIndex);
      }
    }
    return end;
  }

  return undefined;
}
