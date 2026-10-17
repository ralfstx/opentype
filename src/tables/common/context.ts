import { DataReader, subDataView } from '../../data-reader.ts';
import { type GlyphRun } from '../../glyph-run.ts';
import { ClassDefTable } from './classdef.ts';
import { CoverageTable } from './coverage.ts';

// Context rules are shared by contextual substitution (GSUB types 5 and 6)
// and contextual positioning (GPOS types 7 and 8), which use identical
// table layouts.

/**
 * A context rule matches a sequence of input glyphs and specifies inner
 * lookups to apply. The `matchInputAt` function checks if the rule matches
 * at a given position and returns the matched glyph indices, or undefined.
 */
export type ContextRule = {
  readonly matchInputAt: (
    glyphRun: GlyphRun,
    index: number,
    skip?: (glyphId: number) => boolean,
  ) => number[] | undefined;
  readonly lookupRecords: SequenceLookupRecord[];
};

export type SequenceLookupRecord = {
  readonly glyphSequenceIndex: number;
  readonly lookupListIndex: number;
};

type GlyphMatcher = (glyphId: number) => boolean;

/**
 * Reads the rules of a context subtable (GSUB type 5, GPOS type 7) in
 * any of its three formats.
 */
export function readContextRules(data: DataView): ContextRule[] {
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
      const lookupRecords = readSequenceLookupRecords(ruleReader, substCount);

      rules.push({
        matchInputAt: (glyphRun, index, skip) => {
          if (coverage.lookupGlyphId(glyphRun.glyphs[index].glyphId) !== coverageIndex) return undefined;
          return matchForwardGlyphIds(glyphRun, index, inputGlyphIds, skip);
        },
        lookupRecords,
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
      const lookupRecords = readSequenceLookupRecords(ruleReader, substCount);
      const firstClass = classIdx;

      rules.push({
        matchInputAt: (glyphRun, index, skip) => {
          const firstGlyphId = glyphRun.glyphs[index].glyphId;
          if (coverage.lookupGlyphId(firstGlyphId) === -1) return undefined;
          if ((classDef.lookup(firstGlyphId) ?? 0) !== firstClass) return undefined;
          return matchForwardClasses(glyphRun, index, inputClassIds, classDef, skip);
        },
        lookupRecords,
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
  const lookupRecords = readSequenceLookupRecords(reader, substCount);
  const inputCoverages = inputCoverageOffsets.map((offset) => CoverageTable.read(subDataView(data, offset)));

  return [
    {
      matchInputAt: (glyphRun, index, skip) => {
        if (inputCoverages.length === 0) return undefined;
        if (inputCoverages[0].lookupGlyphId(glyphRun.glyphs[index].glyphId) === -1) return undefined;
        return matchForwardCoverages(glyphRun, index, inputCoverages, skip);
      },
      lookupRecords,
    },
  ];
}

function readSequenceLookupRecords(reader: DataReader, count: number): SequenceLookupRecord[] {
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

/**
 * Reads the rules of a chaining context subtable (GSUB type 6, GPOS
 * type 8) in any of its three formats.
 */
export function readChainingContextRules(data: DataView): ContextRule[] {
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
        lookupRecords: sequences.lookupRecords,
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
        lookupRecords: sequences.lookupRecords,
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
  const lookupRecords = readSequenceLookupRecords(reader, substCount);

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
      lookupRecords,
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
    const lookupRecords = readSequenceLookupRecords(reader, substCount);
    return { backtrack, input, lookahead, lookupRecords };
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
