import { DataReader, subDataView } from '../data-reader.ts';
import { type GlyphRun, type ShapedGlyph } from '../glyph-run.ts';
import { ClassDefTable } from './common/classdef.ts';
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

/**
 * Reads all GSUB subtables for a lookup. For Type 6 (chaining contextual),
 * all subtables are consolidated into a single instance so that rules are
 * tried in order at each glyph position (first match wins).
 */
export function readAllGsubSubtables(lookupTable: LookupTable): GsubSubtable[] {
  // Resolve the effective lookup type. For extension lookups (Type 7),
  // peek at the first subtable to determine the actual inner type. The
  // OpenType spec requires all subtables in a lookup to share the same
  // type, so checking only the first one is sufficient.
  let effectiveType = lookupTable.lookupType;
  if (effectiveType === 7 && lookupTable.subTableCount > 0) {
    const { extensionLookupType } = readExtensionSubtable(lookupTable.getSubTableData(0));
    effectiveType = extensionLookupType;
  }

  if (effectiveType === 5) {
    let combined: GsubContextSubstSubtable | undefined;
    for (let i = 0; i < lookupTable.subTableCount; i++) {
      const data = resolveSubtableData(lookupTable, i);
      if (!combined) {
        combined = GsubContextSubstSubtable.read(data);
      } else {
        combined.addRules(data);
      }
    }
    return combined ? [combined] : [];
  }

  if (effectiveType === 6) {
    let combined: GsubChainingContextSubstSubtable | undefined;
    for (let i = 0; i < lookupTable.subTableCount; i++) {
      const data = resolveSubtableData(lookupTable, i);
      if (!combined) {
        combined = GsubChainingContextSubstSubtable.read(data);
      } else {
        combined.addRules(data);
      }
    }
    return combined ? [combined] : [];
  }

  const subtables: GsubSubtable[] = [];
  for (let i = 0; i < lookupTable.subTableCount; i++) {
    const data = resolveSubtableData(lookupTable, i);
    const subtable = readGsubSubtableByType(effectiveType, data);
    if (subtable) subtables.push(subtable);
  }
  return subtables;
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
 * Returns the DataView for a subtable, unwrapping extension headers (Type 7)
 * to get the inner subtable data.
 */
function resolveSubtableData(lookupTable: LookupTable, index: number): DataView {
  const data = lookupTable.getSubTableData(index);
  if (lookupTable.lookupType === 7) {
    return readExtensionSubtable(data).extensionData;
  }
  return data;
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
 * Used by chaining contextual substitution (Type 6) to invoke referenced lookups.
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
 * Subtables are tried in order; the first one that matches wins.
 * Returns true if any subtable matched.
 */
export function applyGsubSubtablesAtIndex(
  subtables: GsubSubtable[],
  glyphRun: GlyphRun,
  index: number,
  getAdvance: (glyphId: number) => number,
  skip: ((glyphId: number) => boolean) | undefined,
  applyLookup: ApplyLookupFn,
): boolean {
  for (const subtable of subtables) {
    if (subtable.applyAtIndex(glyphRun, index, getAdvance, skip, applyLookup)) {
      return true;
    }
  }
  return false;
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
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, advance, skip);
    }
  }

  /**
   * Tries to apply single substitution at a specific glyph position.
   * Returns true if the glyph was substituted.
   */
  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    _applyLookup?: ApplyLookupFn,
  ): boolean {
    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return false;

    const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
    if (coverageIndex === -1) return false;

    if (this.isFormat1) {
      glyph.glyphId = (glyph.glyphId + this.deltaGlyphId) & 0xffff;
    } else {
      const substituteGlyphId = this.substituteGlyphIds[coverageIndex];
      if (substituteGlyphId === undefined) return false;
      glyph.glyphId = substituteGlyphId;
    }

    glyph.advance = getAdvance(glyph.glyphId);
    return true;
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
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      const before = glyphRun.glyphs.length;
      if (this.applyAtIndex(glyphRun, i, advance, skip)) {
        // Skip past newly inserted glyphs (or back up if glyph was deleted)
        i += glyphRun.glyphs.length - before;
      }
    }
  }

  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    _applyLookup?: ApplyLookupFn,
  ): boolean {
    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return false;

    const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
    if (coverageIndex === -1) return false;

    const sequence = this.sequences[coverageIndex];
    if (!sequence) return false;

    if (sequence.length === 0) {
      // Deletion: remove the glyph entirely
      glyphRun.glyphs.splice(index, 1);
      return true;
    }

    // Replace the original glyph with the substitute sequence
    const codePoints = glyph.codePoints;
    const newGlyphs: ShapedGlyph[] = sequence.map((glyphId, i) => ({
      glyphId,
      codePoints: i === 0 ? codePoints : [],
      advance: getAdvance(glyphId),
    }));
    glyphRun.glyphs.splice(index, 1, ...newGlyphs);
    return true;
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
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, advance, skip);
    }
  }

  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
  ): boolean {
    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return false;

    const coverageIndex = this.coverageTable.lookupGlyphId(glyph.glyphId);
    if (coverageIndex === -1) return false;

    const alternateSet = this.alternates[coverageIndex];
    if (!alternateSet || alternateSet.length === 0) return false;

    // Always select the first alternate (index 0), which is the standard
    // behavior for non-interactive shapers. The spec allows a user-selected
    // alternate index, but that requires UI interaction.
    glyph.glyphId = alternateSet[0];
    glyph.advance = getAdvance(glyph.glyphId);
    return true;
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
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, advance, skip);
    }
  }

  /**
   * Tries to form a ligature starting at the given glyph position.
   * Returns true if a ligature was formed (glyphs are spliced in place).
   */
  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    _applyLookup?: ApplyLookupFn,
  ): boolean {
    const startGlyph = glyphRun.glyphs[index];
    if (!startGlyph || skip?.(startGlyph.glyphId)) return false;

    const coverageIndex = this.coverageTable.lookupGlyphId(startGlyph.glyphId);
    if (coverageIndex === -1) return false;

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
      return true;
    }

    return false;
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
 * A context rule matches a sequence of input glyphs and specifies inner
 * lookups to apply. The `matchInputAt` function checks if the rule matches
 * at a given position and returns the matched glyph indices, or undefined.
 */
type ContextRule = {
  readonly matchInputAt: (
    glyphRun: GlyphRun,
    index: number,
    skip?: (glyphId: number) => boolean,
  ) => number[] | undefined;
  readonly substLookupRecords: SubstLookupRecord[];
};

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
  private readonly rules: ContextRule[] = [];

  static read(data: DataView): GsubContextSubstSubtable | undefined {
    const rules = readContextRules(data);
    if (rules.length === 0) return undefined;
    const subtable = new GsubContextSubstSubtable();
    subtable.rules.push(...rules);
    return subtable;
  }

  addRules(data: DataView): boolean {
    const rules = readContextRules(data);
    if (rules.length === 0) return false;
    this.rules.push(...rules);
    return true;
  }

  applyToGlyphRun(
    glyphRun: GlyphRun,
    getAdvance?: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    applyLookup?: ApplyLookupFn,
  ): void {
    if (!applyLookup || !getAdvance) return;

    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, getAdvance, skip, applyLookup);
    }
  }

  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    applyLookup?: ApplyLookupFn,
  ): boolean {
    if (!applyLookup) return false;

    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return false;

    for (const rule of this.rules) {
      const inputIndices = rule.matchInputAt(glyphRun, index, skip);
      if (!inputIndices) continue;

      const indices = inputIndices.slice();
      for (const record of rule.substLookupRecords) {
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
        }
      }
      return true;
    }

    return false;
  }
}

function readContextRules(data: DataView): ContextRule[] {
  const reader = new DataReader(data);
  const format = reader.readUint16();

  if (format === 1) return readContextFormat1(data, reader);
  if (format === 2) return readContextFormat2(data, reader);
  if (format === 3) return readContextFormat3(reader, data);
  return [];
}

// Format 1: glyph-based. Coverage identifies first glyph, then each rule
// set contains rules with explicit glyph ID sequences.
function readContextFormat1(data: DataView, reader: DataReader): ContextRule[] {
  const coverageOffset = reader.readUint16();
  const ruleSetCount = reader.readUint16();
  const ruleSetOffsets = Array.from({ length: ruleSetCount }, () => reader.readUint16());
  const coverage = CoverageTable.read(subDataView(data, coverageOffset));

  const rules: ContextRule[] = [];
  for (let i = 0; i < ruleSetCount; i++) {
    if (ruleSetOffsets[i] === 0) continue;
    const ruleSetData = subDataView(data, ruleSetOffsets[i]);
    const ruleSetReader = new DataReader(ruleSetData);
    const ruleCount = ruleSetReader.readUint16();
    const ruleOffsets = Array.from({ length: ruleCount }, () => ruleSetReader.readUint16());
    const coverageIndex = i;

    for (const ruleOffset of ruleOffsets) {
      const ruleData = subDataView(ruleSetData, ruleOffset);
      const ruleReader = new DataReader(ruleData);
      const glyphCount = ruleReader.readUint16();
      const substCount = ruleReader.readUint16();
      const inputGlyphIds = Array.from({ length: glyphCount - 1 }, () => ruleReader.readUint16());
      const substLookupRecords = readSubstLookupRecords(ruleReader, substCount);

      rules.push({
        matchInputAt: (glyphRun, index, skip) => {
          if (coverage.lookupGlyphId(glyphRun.glyphs[index].glyphId) !== coverageIndex) return undefined;
          return matchForwardGlyphIds(glyphRun, index, inputGlyphIds, skip);
        },
        substLookupRecords,
      });
    }
  }
  return rules;
}

// Format 2: class-based. Coverage identifies first glyph, ClassDef assigns
// classes, then each rule set is indexed by the first glyph's class.
function readContextFormat2(data: DataView, reader: DataReader): ContextRule[] {
  const coverageOffset = reader.readUint16();
  const classDefOffset = reader.readUint16();
  const classSetCount = reader.readUint16();
  const classSetOffsets = Array.from({ length: classSetCount }, () => reader.readUint16());
  const coverage = CoverageTable.read(subDataView(data, coverageOffset));
  const classDef = ClassDefTable.read(subDataView(data, classDefOffset));

  const rules: ContextRule[] = [];
  for (let classIdx = 0; classIdx < classSetCount; classIdx++) {
    if (classSetOffsets[classIdx] === 0) continue;
    const classSetData = subDataView(data, classSetOffsets[classIdx]);
    const classSetReader = new DataReader(classSetData);
    const ruleCount = classSetReader.readUint16();
    const ruleOffsets = Array.from({ length: ruleCount }, () => classSetReader.readUint16());

    for (const ruleOffset of ruleOffsets) {
      const ruleData = subDataView(classSetData, ruleOffset);
      const ruleReader = new DataReader(ruleData);
      const glyphCount = ruleReader.readUint16();
      const substCount = ruleReader.readUint16();
      const inputClassIds = Array.from({ length: glyphCount - 1 }, () => ruleReader.readUint16());
      const substLookupRecords = readSubstLookupRecords(ruleReader, substCount);
      const firstClass = classIdx;

      rules.push({
        matchInputAt: (glyphRun, index, skip) => {
          const firstGlyphId = glyphRun.glyphs[index].glyphId;
          if (coverage.lookupGlyphId(firstGlyphId) === -1) return undefined;
          if ((classDef.lookup(firstGlyphId) ?? 0) !== firstClass) return undefined;
          return matchForwardClasses(glyphRun, index, inputClassIds, classDef, skip);
        },
        substLookupRecords,
      });
    }
  }
  return rules;
}

// Format 3: coverage-based. Each input position has its own coverage table.
function readContextFormat3(reader: DataReader, data: DataView): ContextRule[] {
  const inputGlyphCount = reader.readUint16();
  const substCount = reader.readUint16();
  const inputCoverageOffsets = Array.from({ length: inputGlyphCount }, () => reader.readUint16());
  const substLookupRecords = readSubstLookupRecords(reader, substCount);
  const inputCoverages = inputCoverageOffsets.map((offset) => CoverageTable.read(subDataView(data, offset)));

  return [
    {
      matchInputAt: (glyphRun, index, skip) => {
        if (inputCoverages.length === 0) return undefined;
        if (inputCoverages[0].lookupGlyphId(glyphRun.glyphs[index].glyphId) === -1) return undefined;
        return matchForwardCoverages(glyphRun, index, inputCoverages, skip);
      },
      substLookupRecords,
    },
  ];
}

function readSubstLookupRecords(reader: DataReader, count: number): SubstLookupRecord[] {
  return Array.from({ length: count }, () => ({
    glyphSequenceIndex: reader.readUint16(),
    lookupListIndex: reader.readUint16(),
  }));
}

/**
 * Matches forward glyph IDs starting after `startIndex`, skipping filtered
 * glyphs. Returns matched indices (including startIndex), or undefined.
 */
function matchForwardGlyphIds(
  glyphRun: GlyphRun,
  startIndex: number,
  glyphIds: number[],
  skip?: (glyphId: number) => boolean,
): number[] | undefined {
  const indices: number[] = [startIndex];
  let pos = startIndex;
  for (const expectedId of glyphIds) {
    pos = findNextNonSkipped(glyphRun, pos, skip);
    if (pos === -1) return undefined;
    if (glyphRun.glyphs[pos].glyphId !== expectedId) return undefined;
    indices.push(pos);
  }
  return indices;
}

/**
 * Matches forward class values starting after `startIndex`, skipping
 * filtered glyphs. Returns matched indices (including startIndex), or undefined.
 */
function matchForwardClasses(
  glyphRun: GlyphRun,
  startIndex: number,
  classIds: number[],
  classDef: ClassDefTable,
  skip?: (glyphId: number) => boolean,
): number[] | undefined {
  const indices: number[] = [startIndex];
  let pos = startIndex;
  for (const expectedClass of classIds) {
    pos = findNextNonSkipped(glyphRun, pos, skip);
    if (pos === -1) return undefined;
    if ((classDef.lookup(glyphRun.glyphs[pos].glyphId) ?? 0) !== expectedClass) return undefined;
    indices.push(pos);
  }
  return indices;
}

// === Chaining Contextual Substitution (Type 6) ===

type SubstLookupRecord = {
  readonly glyphSequenceIndex: number;
  readonly lookupListIndex: number;
};

type GlyphMatcher = (glyphId: number) => boolean;

/**
 * Lookup type 6 subtable: chaining contextual substitution.
 * Matches a sequence of glyphs with backtrack, input, and lookahead
 * contexts, then applies referenced inner lookups to specific input glyphs.
 *
 * A lookup may contain multiple subtables (rules) that are tried in order
 * at each glyph position — the first matching rule wins. To support this,
 * all subtables of a Type 6 lookup are collected into a single instance
 * via the `addRules` method.
 *
 * Supports all three formats:
 * - Format 1: glyph-based rules (coverage + explicit glyph ID sequences)
 * - Format 2: class-based rules (coverage + ClassDefs + class sequences)
 * - Format 3: coverage-based rules (per-position coverage tables)
 */
export class GsubChainingContextSubstSubtable {
  private readonly rules: ContextRule[] = [];

  static read(data: DataView): GsubChainingContextSubstSubtable | undefined {
    const rules = readChainingContextRules(data);
    if (rules.length === 0) return undefined;
    const subtable = new GsubChainingContextSubstSubtable();
    subtable.rules.push(...rules);
    return subtable;
  }

  addRules(data: DataView): boolean {
    const rules = readChainingContextRules(data);
    if (rules.length === 0) return false;
    this.rules.push(...rules);
    return true;
  }

  applyToGlyphRun(
    glyphRun: GlyphRun,
    getAdvance?: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    applyLookup?: ApplyLookupFn,
  ): void {
    if (!applyLookup || !getAdvance) return;

    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      this.applyAtIndex(glyphRun, i, getAdvance, skip, applyLookup);
    }
  }

  /**
   * Tries to match a chaining contextual rule at the given glyph position.
   * Returns true if a rule matched and inner lookups were applied.
   */
  applyAtIndex(
    glyphRun: GlyphRun,
    index: number,
    getAdvance: (glyphId: number) => number,
    skip?: (glyphId: number) => boolean,
    applyLookup?: ApplyLookupFn,
  ): boolean {
    if (!applyLookup) return false;

    const glyph = glyphRun.glyphs[index];
    if (!glyph || skip?.(glyph.glyphId)) return false;

    // Try each rule in order — first match wins at this position
    for (const rule of this.rules) {
      const inputIndices = rule.matchInputAt(glyphRun, index, skip);
      if (!inputIndices) continue;

      // All contexts match — apply inner lookups and stop trying rules
      const indices = inputIndices.slice();
      for (const record of rule.substLookupRecords) {
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
        }
      }
      return true;
    }

    return false;
  }
}

function readChainingContextRules(data: DataView): ContextRule[] {
  const reader = new DataReader(data);
  const format = reader.readUint16();

  if (format === 1) return readChainingContextFormat1(data, reader);
  if (format === 2) return readChainingContextFormat2(data, reader);
  if (format === 3) return readChainingContextFormat3(data, reader);
  return [];
}

// Format 1: glyph-based. Coverage identifies the first input glyph, then
// each rule set contains rules with explicit glyph ID sequences.
function readChainingContextFormat1(data: DataView, reader: DataReader): ContextRule[] {
  const coverageOffset = reader.readUint16();
  const ruleSetCount = reader.readUint16();
  const ruleSetOffsets = Array.from({ length: ruleSetCount }, () => reader.readUint16());
  const coverage = CoverageTable.read(subDataView(data, coverageOffset));
  const matchGlyphId = (expectedId: number) => (glyphId: number) => glyphId === expectedId;

  const rules: ContextRule[] = [];
  for (let i = 0; i < ruleSetCount; i++) {
    if (ruleSetOffsets[i] === 0) continue;
    const coverageIndex = i;

    for (const sequences of readChainingRuleSet(subDataView(data, ruleSetOffsets[i]))) {
      const backtrack = sequences.backtrack.map(matchGlyphId);
      const input = sequences.input.map(matchGlyphId);
      const lookahead = sequences.lookahead.map(matchGlyphId);

      rules.push({
        matchInputAt: (glyphRun, index, skip) => {
          if (coverage.lookupGlyphId(glyphRun.glyphs[index].glyphId) !== coverageIndex) return undefined;
          return matchChainingSequences(glyphRun, index, backtrack, input, lookahead, skip);
        },
        substLookupRecords: sequences.substLookupRecords,
      });
    }
  }
  return rules;
}

// Format 2: class-based. Coverage identifies the first input glyph,
// separate ClassDefs assign classes to backtrack, input, and lookahead
// glyphs, and each rule set is indexed by the first input glyph's class.
function readChainingContextFormat2(data: DataView, reader: DataReader): ContextRule[] {
  const coverageOffset = reader.readUint16();
  const backtrackClassDefOffset = reader.readUint16();
  const inputClassDefOffset = reader.readUint16();
  const lookaheadClassDefOffset = reader.readUint16();
  const classSetCount = reader.readUint16();
  const classSetOffsets = Array.from({ length: classSetCount }, () => reader.readUint16());
  const coverage = CoverageTable.read(subDataView(data, coverageOffset));
  const backtrackClassDef = readOptionalClassDef(data, backtrackClassDefOffset);
  const inputClassDef = readOptionalClassDef(data, inputClassDefOffset);
  const lookaheadClassDef = readOptionalClassDef(data, lookaheadClassDefOffset);
  const matchClass = (classDef: ClassDefTable | undefined) => (expectedClass: number) => (glyphId: number) =>
    (classDef?.lookup(glyphId) ?? 0) === expectedClass;

  const rules: ContextRule[] = [];
  for (let classIdx = 0; classIdx < classSetCount; classIdx++) {
    if (classSetOffsets[classIdx] === 0) continue;
    const firstClass = classIdx;

    for (const sequences of readChainingRuleSet(subDataView(data, classSetOffsets[classIdx]))) {
      const backtrack = sequences.backtrack.map(matchClass(backtrackClassDef));
      const input = sequences.input.map(matchClass(inputClassDef));
      const lookahead = sequences.lookahead.map(matchClass(lookaheadClassDef));

      rules.push({
        matchInputAt: (glyphRun, index, skip) => {
          const firstGlyphId = glyphRun.glyphs[index].glyphId;
          if (coverage.lookupGlyphId(firstGlyphId) === -1) return undefined;
          if ((inputClassDef?.lookup(firstGlyphId) ?? 0) !== firstClass) return undefined;
          return matchChainingSequences(glyphRun, index, backtrack, input, lookahead, skip);
        },
        substLookupRecords: sequences.substLookupRecords,
      });
    }
  }
  return rules;
}

// Format 3: coverage-based. Each backtrack, input, and lookahead position
// has its own coverage table.
function readChainingContextFormat3(data: DataView, reader: DataReader): ContextRule[] {
  const readCoverages = () => {
    const count = reader.readUint16();
    const offsets = Array.from({ length: count }, () => reader.readUint16());
    return offsets.map((offset) => CoverageTable.read(subDataView(data, offset)));
  };
  const backtrackCoverages = readCoverages();
  const inputCoverages = readCoverages();
  const lookaheadCoverages = readCoverages();
  const substCount = reader.readUint16();
  const substLookupRecords = readSubstLookupRecords(reader, substCount);

  if (inputCoverages.length === 0) return [];
  const [firstCoverage, ...remainingCoverages] = inputCoverages;
  const matchCoverage = (coverage: CoverageTable) => (glyphId: number) => coverage.lookupGlyphId(glyphId) !== -1;
  const backtrack = backtrackCoverages.map(matchCoverage);
  const input = remainingCoverages.map(matchCoverage);
  const lookahead = lookaheadCoverages.map(matchCoverage);

  return [
    {
      matchInputAt: (glyphRun, index, skip) => {
        if (firstCoverage.lookupGlyphId(glyphRun.glyphs[index].glyphId) === -1) return undefined;
        return matchChainingSequences(glyphRun, index, backtrack, input, lookahead, skip);
      },
      substLookupRecords,
    },
  ];
}

/**
 * Reads a ChainSubRuleSet (Format 1) or ChainSubClassSet (Format 2). Both
 * share the same layout; the sequences contain glyph IDs or class values,
 * respectively. The input sequence excludes the first input glyph.
 */
function readChainingRuleSet(data: DataView) {
  const setReader = new DataReader(data);
  const ruleCount = setReader.readUint16();
  const ruleOffsets = Array.from({ length: ruleCount }, () => setReader.readUint16());

  return ruleOffsets.map((ruleOffset) => {
    const reader = new DataReader(subDataView(data, ruleOffset));
    const backtrackCount = reader.readUint16();
    const backtrack = Array.from({ length: backtrackCount }, () => reader.readUint16());
    const inputCount = reader.readUint16();
    const input = Array.from({ length: Math.max(0, inputCount - 1) }, () => reader.readUint16());
    const lookaheadCount = reader.readUint16();
    const lookahead = Array.from({ length: lookaheadCount }, () => reader.readUint16());
    const substCount = reader.readUint16();
    const substLookupRecords = readSubstLookupRecords(reader, substCount);
    return { backtrack, input, lookahead, substLookupRecords };
  });
}

function readOptionalClassDef(data: DataView, offset: number): ClassDefTable | undefined {
  return offset ? ClassDefTable.read(subDataView(data, offset)) : undefined;
}

/**
 * Matches the input sequence after `index`, the backtrack sequence before
 * `index`, and the lookahead sequence after the last input glyph, skipping
 * filtered glyphs. The glyph at `index` must already be checked by the
 * caller. Per the OpenType spec, backtrack[0] matches the glyph immediately
 * before the input sequence, backtrack[1] the one before that, etc.
 * Returns the matched input indices (including `index`), or undefined.
 */
function matchChainingSequences(
  glyphRun: GlyphRun,
  index: number,
  backtrack: GlyphMatcher[],
  input: GlyphMatcher[],
  lookahead: GlyphMatcher[],
  skip?: (glyphId: number) => boolean,
): number[] | undefined {
  const indices: number[] = [index];
  let pos = index;
  for (const matches of input) {
    pos = findNextNonSkipped(glyphRun, pos, skip);
    if (pos === -1 || !matches(glyphRun.glyphs[pos].glyphId)) return undefined;
    indices.push(pos);
  }

  pos = index;
  for (const matches of backtrack) {
    pos = findPrevNonSkipped(glyphRun, pos, skip);
    if (pos === -1 || !matches(glyphRun.glyphs[pos].glyphId)) return undefined;
  }

  pos = indices[indices.length - 1];
  for (const matches of lookahead) {
    pos = findNextNonSkipped(glyphRun, pos, skip);
    if (pos === -1 || !matches(glyphRun.glyphs[pos].glyphId)) return undefined;
  }

  return indices;
}

/**
 * Matches forward coverages starting at `startIndex`. The first coverage
 * matches the glyph at `startIndex` itself; subsequent coverages match the
 * next non-skipped glyphs. Returns matched glyph indices, or undefined.
 */
function matchForwardCoverages(
  glyphRun: GlyphRun,
  startIndex: number,
  coverages: CoverageTable[],
  skip?: (glyphId: number) => boolean,
): number[] | undefined {
  const indices: number[] = [startIndex];
  let pos = startIndex;
  for (let c = 1; c < coverages.length; c++) {
    pos = findNextNonSkipped(glyphRun, pos, skip);
    if (pos === -1) return undefined;
    if (coverages[c].lookupGlyphId(glyphRun.glyphs[pos].glyphId) === -1) return undefined;
    indices.push(pos);
  }
  return indices;
}

function findNextNonSkipped(glyphRun: GlyphRun, pos: number, skip?: (glyphId: number) => boolean): number {
  for (let j = pos + 1; j < glyphRun.glyphs.length; j++) {
    if (!skip?.(glyphRun.glyphs[j].glyphId)) return j;
  }
  return -1;
}

function findPrevNonSkipped(glyphRun: GlyphRun, pos: number, skip?: (glyphId: number) => boolean): number {
  for (let j = pos - 1; j >= 0; j--) {
    if (!skip?.(glyphRun.glyphs[j].glyphId)) return j;
  }
  return -1;
}
