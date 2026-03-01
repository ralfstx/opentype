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

  if (effectiveType === 6) {
    let combined: GsubChainingContextSubstSubtable | undefined;
    for (let i = 0; i < lookupTable.subTableCount; i++) {
      const data = resolveSubtableData(lookupTable, i);
      if (!combined) {
        combined = GsubChainingContextSubstSubtable.read(data);
      } else {
        combined.addRule(data);
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
  if (lookupType === 4) {
    return GsubLigatureSubstSubtable.read(data);
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

export type GsubSubtable = GsubSingleSubstSubtable | GsubLigatureSubstSubtable | GsubChainingContextSubstSubtable;

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
  skip?: (glyphId: number) => boolean,
  applyLookup?: ApplyLookupFn,
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

// === Chaining Contextual Substitution (Type 6) ===

type SubstLookupRecord = {
  readonly glyphSequenceIndex: number;
  readonly lookupListIndex: number;
};

type ChainingContextRule = {
  readonly backtrackCoverages: CoverageTable[];
  readonly inputCoverages: CoverageTable[];
  readonly lookaheadCoverages: CoverageTable[];
  readonly substLookupRecords: SubstLookupRecord[];
};

/**
 * Lookup type 6 subtable: chaining contextual substitution.
 * Matches a sequence of glyphs with backtrack, input, and lookahead
 * contexts, then applies referenced inner lookups to specific input glyphs.
 *
 * A lookup may contain multiple subtables (rules) that are tried in order
 * at each glyph position — the first matching rule wins. To support this,
 * all subtables of a Type 6 lookup are collected into a single instance
 * via the `addRule` method.
 *
 * Currently supports Format 3 (coverage-based) only.
 */
export class GsubChainingContextSubstSubtable {
  private readonly rules: ChainingContextRule[] = [];

  static read(data: DataView): GsubChainingContextSubstSubtable | undefined {
    const rule = readChainingContextRule(data);
    if (!rule) return undefined;
    const subtable = new GsubChainingContextSubstSubtable();
    subtable.rules.push(rule);
    return subtable;
  }

  addRule(data: DataView): boolean {
    const rule = readChainingContextRule(data);
    if (!rule) return false;
    this.rules.push(rule);
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
      if (rule.inputCoverages.length === 0) continue;

      // Check first input coverage
      if (rule.inputCoverages[0].lookupGlyphId(glyph.glyphId) === -1) continue;

      // Match remaining input glyphs (forward from index, skipping filtered)
      const inputIndices = matchForwardCoverages(glyphRun, index, rule.inputCoverages, skip);
      if (!inputIndices) continue;

      // Match backtrack glyphs (backward from index, skipping filtered)
      if (!matchBacktrackCoverages(glyphRun, index, rule.backtrackCoverages, skip)) continue;

      // Match lookahead glyphs (forward from last input, skipping filtered)
      const lastInputIndex = inputIndices[inputIndices.length - 1];
      if (!matchLookaheadCoverages(glyphRun, lastInputIndex, rule.lookaheadCoverages, skip)) continue;

      // All contexts match — apply inner lookups and stop trying rules
      for (const record of rule.substLookupRecords) {
        const targetIndex = inputIndices[record.glyphSequenceIndex];
        if (targetIndex !== undefined) {
          applyLookup(record.lookupListIndex, glyphRun, targetIndex, getAdvance);
        }
      }
      return true;
    }

    return false;
  }
}

// Only Format 3 (coverage-based) is supported. Formats 1 and 2 (class-based
// and simple) are silently skipped — they are rare in Latin fonts.
function readChainingContextRule(data: DataView): ChainingContextRule | undefined {
  const reader = new DataReader(data);
  const format = reader.readUint16();
  if (format !== 3) return undefined;

  const backtrackGlyphCount = reader.readUint16();
  const backtrackCoverageOffsets = Array.from({ length: backtrackGlyphCount }, () => reader.readUint16());

  const inputGlyphCount = reader.readUint16();
  const inputCoverageOffsets = Array.from({ length: inputGlyphCount }, () => reader.readUint16());

  const lookaheadGlyphCount = reader.readUint16();
  const lookaheadCoverageOffsets = Array.from({ length: lookaheadGlyphCount }, () => reader.readUint16());

  const substCount = reader.readUint16();
  const substLookupRecords = Array.from({ length: substCount }, () => ({
    glyphSequenceIndex: reader.readUint16(),
    lookupListIndex: reader.readUint16(),
  }));

  return {
    backtrackCoverages: backtrackCoverageOffsets.map((offset) => CoverageTable.read(subDataView(data, offset))),
    inputCoverages: inputCoverageOffsets.map((offset) => CoverageTable.read(subDataView(data, offset))),
    lookaheadCoverages: lookaheadCoverageOffsets.map((offset) => CoverageTable.read(subDataView(data, offset))),
    substLookupRecords,
  };
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

/**
 * Matches backtrack coverages going backward from `startIndex` (exclusive).
 * Per the OpenType spec, backtrack coverage[0] matches the glyph immediately
 * before the input sequence, coverage[1] the one before that, etc.
 */
function matchBacktrackCoverages(
  glyphRun: GlyphRun,
  startIndex: number,
  coverages: CoverageTable[],
  skip?: (glyphId: number) => boolean,
): boolean {
  let pos = startIndex;
  for (const coverage of coverages) {
    pos = findPrevNonSkipped(glyphRun, pos, skip);
    if (pos === -1) return false;
    if (coverage.lookupGlyphId(glyphRun.glyphs[pos].glyphId) === -1) return false;
  }
  return true;
}

/**
 * Matches lookahead coverages going forward from `startIndex` (exclusive).
 */
function matchLookaheadCoverages(
  glyphRun: GlyphRun,
  startIndex: number,
  coverages: CoverageTable[],
  skip?: (glyphId: number) => boolean,
): boolean {
  let pos = startIndex;
  for (const coverage of coverages) {
    pos = findNextNonSkipped(glyphRun, pos, skip);
    if (pos === -1) return false;
    if (coverage.lookupGlyphId(glyphRun.glyphs[pos].glyphId) === -1) return false;
  }
  return true;
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
