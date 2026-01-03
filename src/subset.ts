import { type Font } from './font.ts';
import { FontBuilder } from './font-builder.ts';
import { type CmapFormat12Group, CmapTableBuilder } from './tables/cmap.ts';
import { type GlyfTable, GlyfTableBuilder, type Glyph } from './tables/glyf.ts';
import { type HeadTable, HeadTableBuilder } from './tables/head.ts';
import { type HheaTable, HheaTableBuilder } from './tables/hhea.ts';
import { type HmtxTable, HmtxTableBuilder } from './tables/hmtx.ts';
import { LocaTableBuilder } from './tables/loca.ts';
import { MaxpTableBuilder } from './tables/maxp.ts';
import { type NameTable, NameTableBuilder } from './tables/name.ts';
import { type Os2Table, Os2TableBuilder } from './tables/os2.ts';
import { type PostTable, PostTableBuilder } from './tables/post.ts';

/**
 * The result of subsetting a font.
 */
export type SubsetFontResult = {
  /** The subset font data. */
  fontData: Uint8Array;
  /** Maps original glyph IDs to their new IDs in the subset font. */
  glyphIdMapping: ReadonlyMap<number, number>;
};

/**
 * Creates a subset of the given font containing only the specified glyphs.
 *
 * The resulting font will include glyph ID 0 (.notdef) automatically, plus
 * all glyphs referenced by composite glyphs in the subset.
 *
 * @param font The font to subset
 * @param glyphIds The glyph IDs to include in the subset
 */
export function createSubset(font: Font, glyphIds: number[]): SubsetFontResult {
  const headTable = font.tables.head;
  if (!headTable) {
    throw new Error('head table not found in font');
  }
  const hheaTable = font.tables.hhea;
  if (!hheaTable) {
    throw new Error('hhea table not found in font');
  }
  const glyfTable = font.tables.glyf;
  if (!glyfTable) {
    throw new Error('glyf table not found in font');
  }
  const cmapTable = font.tables.cmap;
  if (!cmapTable) {
    throw new Error('cmap table not found in font');
  }
  const hmtxTable = font.tables.hmtx;
  if (!hmtxTable) {
    throw new Error('hmtx table not found in font');
  }
  const nameTable = font.tables.name;
  if (!nameTable) {
    throw new Error('name table not found in font');
  }
  const os2Table = font.tables['OS/2'];
  if (!os2Table) {
    throw new Error('OS/2 table not found in font');
  }
  const postTable = font.tables.post;
  if (!postTable) {
    throw new Error('post table not found in font');
  }

  const { glyphIds: subsetGlyphIds, glyphs: subsetGlyphs } = collectSubsetGlyphs(glyfTable, glyphIds);

  // Create a mapper from original glyph IDs to new subset IDs
  const glyphIdMapper = createGlyphIdMapper(subsetGlyphIds);

  // Read all cmap mappings and filter to only those in the subset
  const remappedCmap = createRemappedCmap(font.glyphMapping, subsetGlyphIds, glyphIdMapper);

  // Build all required tables
  const fontBuilder = new FontBuilder();

  const glyfTableBuilder = new GlyfTableBuilder(subsetGlyphs, glyphIdMapper);
  const locaTableBuilder = LocaTableBuilder.forOffsets(glyfTableBuilder.offsets());
  const maxpTableBuilder = MaxpTableBuilder.forTTF(subsetGlyphs.length);

  fontBuilder.addTable(glyfTableBuilder);
  fontBuilder.addTable(locaTableBuilder);
  fontBuilder.addTable(maxpTableBuilder);

  fontBuilder.addTable(subsetHeadTable(headTable, locaTableBuilder.format));
  fontBuilder.addTable(subsetHheaTable(hheaTable, subsetGlyphs.length));
  fontBuilder.addTable(subsetHmtxTable(hmtxTable, subsetGlyphIds));
  fontBuilder.addTable(subsetNameTable(nameTable));
  fontBuilder.addTable(subsetCmapTable(remappedCmap));
  fontBuilder.addTable(subsetOs2Table(os2Table, remappedCmap));
  fontBuilder.addTable(subsetPostTable(postTable));

  const fontData = new Uint8Array(fontBuilder.build().buffer);
  const glyphIdMapping = new Map(glyphIds.map((id) => [id, glyphIdMapper(id)]));
  return { fontData, glyphIdMapping };
}

/**
 * Creates a new cmap mapping with remapped glyph IDs for the subset font.
 * Only includes mappings for glyphs that are in the subset.
 */
function createRemappedCmap(
  originalMappings: ReadonlyMap<number, number>,
  subsetGlyphIds: number[],
  glyphIdMapper: (oldGlyphId: number) => number,
): Map<number, number> {
  const subsetGlyphIdSet = new Set(subsetGlyphIds);
  const remapped = new Map<number, number>();
  for (const [codePoint, originalGlyphId] of originalMappings) {
    if (subsetGlyphIdSet.has(originalGlyphId)) {
      remapped.set(codePoint, glyphIdMapper(originalGlyphId));
    }
  }
  return remapped;
}

/**
 * Creates a mapping function from original glyph IDs to subset glyph IDs.
 */
function createGlyphIdMapper(subsetGlyphIds: number[]): (oldGlyphId: number) => number {
  const glyphIdMap = new Map(subsetGlyphIds.map((id, index) => [id, index]));
  return (oldGlyphId: number) => {
    const newId = glyphIdMap.get(oldGlyphId);
    if (newId === undefined) {
      throw new Error(`Glyph ID ${oldGlyphId} not found in subset`);
    }
    return newId;
  };
}

/**
 * Collects all glyphs needed for the subset, including:
 * - The .notdef glyph (ID 0)
 * - All requested glyphs
 * - All glyphs referenced by composite glyphs
 */
function collectSubsetGlyphs(
  glyfTable: GlyfTable,
  requestedGlyphIds: number[],
): { glyphIds: number[]; glyphs: Glyph[] } {
  const result = new Map<number, Glyph>();

  // Always include .notdef glyph (ID 0)
  const glyphIdsToProcess = new Set([0, ...requestedGlyphIds]);

  for (const glyphId of glyphIdsToProcess) {
    addGlyphWithDependencies(glyfTable, glyphId, result);
  }

  return {
    glyphIds: Array.from(result.keys()),
    glyphs: Array.from(result.values()),
  };
}

/**
 * Recursively adds a glyph and its dependencies (for composite glyphs) to the result map.
 */
function addGlyphWithDependencies(glyfTable: GlyfTable, glyphId: number, result: Map<number, Glyph>, depth = 0): void {
  const maxDepth = 16;
  if (depth > maxDepth) {
    throw new Error(`Glyph reference depth exceeds maximum of ${maxDepth}`);
  }

  if (result.has(glyphId)) {
    return;
  }

  const glyph = glyfTable.readGlyph(glyphId);

  // For composite glyphs, add referenced glyphs first to ensure proper ordering
  if (glyph.type === 'composite') {
    for (const referencedId of glyph.glyphIds) {
      addGlyphWithDependencies(glyfTable, referencedId, result, depth + 1);
    }
  }

  result.set(glyphId, glyph);
}

function subsetHeadTable(headTable: HeadTable, locaFormat: 'short' | 'long'): HeadTableBuilder {
  const builder = new HeadTableBuilder(headTable);
  builder.modified = new Date();
  builder.indexToLocFormat = locaFormat === 'long' ? 1 : 0;
  return builder;
}

function subsetHheaTable(hheaTable: HheaTable, numGlyphs: number): HheaTableBuilder {
  const builder = new HheaTableBuilder(hheaTable);
  // All glyphs in the subset will have their own hMetric entry
  builder.numberOfHMetrics = numGlyphs;
  return builder;
}

function subsetHmtxTable(hmtxTable: HmtxTable, subsetGlyphIds: number[]): HmtxTableBuilder {
  const hMetrics = subsetGlyphIds.map((glyphId) => {
    // Get the metric for this glyph, accounting for the hmtx optimization
    // where glyphs beyond numberOfHMetrics share the last advanceWidth
    if (glyphId < hmtxTable.hMetrics.length) {
      return { ...hmtxTable.hMetrics[glyphId] };
    }
    // Glyph uses the last advanceWidth with its own leftSideBearing
    const lastMetric = hmtxTable.hMetrics[hmtxTable.hMetrics.length - 1];
    const lsbIndex = glyphId - hmtxTable.hMetrics.length;
    const leftSideBearing = hmtxTable.leftSideBearings?.[lsbIndex] ?? 0;
    return { advanceWidth: lastMetric.advanceWidth, leftSideBearing };
  });

  return new HmtxTableBuilder({ hMetrics });
}

function subsetNameTable(nameTable: NameTable): NameTableBuilder {
  const builder = new NameTableBuilder();
  // Add common name IDs used in fonts
  // Name ID 1 – Font Family name
  // Name ID 2 – Font Subfamily name
  // Name ID 3 – Unique font identifier
  // Name ID 4 – Full font name
  // Name ID 5 – Version string
  // Name ID 6 – PostScript name
  // Name ID 7 – Trademark
  // Name ID 0 – Copyright notice
  // Name ID 16 – Typographic Family name
  // Name ID 17 – Typographic Subfamily name
  for (const nameId of [1, 2, 3, 4, 5, 6, 7, 0, 16, 17]) {
    const result = nameTable.findName(nameId);
    if (result) {
      builder.addName(nameId, result.name, result.language ?? 'en');
    }
  }
  return builder;
}

/**
 * Creates a subset OS/2 table, updating the character range fields based on the subset cmap.
 */
function subsetOs2Table(os2Table: Os2Table, remappedCmap: Map<number, number>): Os2TableBuilder {
  const builder = new Os2TableBuilder(os2Table);

  // Update usFirstCharIndex and usLastCharIndex based on the subset cmap
  if (remappedCmap.size > 0) {
    const codePoints = Array.from(remappedCmap.keys());
    const minCodePoint = Math.min(...codePoints);
    const maxCodePoint = Math.max(...codePoints);
    // usFirstCharIndex and usLastCharIndex are 16-bit, clamp to 0xFFFF
    builder.usFirstCharIndex = Math.min(minCodePoint, 0xffff);
    builder.usLastCharIndex = Math.min(maxCodePoint, 0xffff);
  } else {
    builder.usFirstCharIndex = 0;
    builder.usLastCharIndex = 0;
  }

  return builder;
}

/**
 * Creates a subset post table using version 3.0 (no glyph names).
 * Version 3.0 is preferred for PDF font embedding as glyph names are not required.
 */
function subsetPostTable(postTable: PostTable): PostTableBuilder {
  return new PostTableBuilder(postTable);
}

/**
 * Creates a subset cmap table containing only the specified mappings.
 */
export function subsetCmapTable(codePointToGlyphId: Map<number, number>): CmapTableBuilder {
  const builder = new CmapTableBuilder();
  const groups = createFormat12Groups(codePointToGlyphId);

  // Add Windows Unicode full repertoire (platformID=3, encodingID=10)
  builder.addSubtable12(3, 10, groups);
  // Add Unicode full repertoire (platformID=0, encodingID=4)
  builder.addSubtable12(0, 4, groups);

  return builder;
}

/**
 * Creates format 12 groups from a code point to glyph ID mapping.
 * Groups consecutive code points that map to consecutive glyph IDs.
 */
function createFormat12Groups(codePointToGlyphId: Map<number, number>): CmapFormat12Group[] {
  if (codePointToGlyphId.size === 0) {
    return [];
  }

  // Sort code points
  const sortedCodePoints = Array.from(codePointToGlyphId.keys()).sort((a, b) => a - b);

  const groups: CmapFormat12Group[] = [];
  let currentGroup: CmapFormat12Group | undefined;

  for (const codePoint of sortedCodePoints) {
    const glyphId = codePointToGlyphId.get(codePoint)!;

    if (
      currentGroup &&
      codePoint === currentGroup.endCharCode + 1 &&
      glyphId === currentGroup.startGlyphID + (codePoint - currentGroup.startCharCode)
    ) {
      // Extend current group
      currentGroup.endCharCode = codePoint;
    } else {
      // Start a new group
      currentGroup = {
        startCharCode: codePoint,
        endCharCode: codePoint,
        startGlyphID: glyphId,
      };
      groups.push(currentGroup);
    }
  }

  return groups;
}
