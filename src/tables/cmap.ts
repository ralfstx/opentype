import { DataReader, subDataView } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { TableBuilder } from '../table-builder.ts';

/**
 * An encoding record in the 'cmap' table.
 */
export type EncodingRecord = {
  /** The platform ID for this encoding record. */
  readonly platformID: number;
  /** The encoding ID for this encoding record. */
  readonly encodingID: number;
  /** Reads the subtable for this encoding record. */
  readonly readSubtable: () => CmapSubtable;
};

/**
 * A subtable in the 'cmap' table.
 */
export type CmapSubtable = {
  /** The format of this cmap subtable. */
  readonly format: number;
  /** The language of this cmap subtable. */
  readonly language: number;
  /** Reads the mapping of character codes to glyph indices. */
  readonly readGlyphMapping: () => ReadonlyMap<number, number>;
};

/**
 * The 'cmap' table maps character codes to glyph indices.
 */
export class CmapTable {
  /** The encoding records in this 'cmap' table. */
  readonly encodingRecords: ReadonlyArray<EncodingRecord>;

  /**
   * Reads a 'cmap' table from the given DataView.
   */
  static read(data: DataView): CmapTable {
    return new CmapTable(data);
  }

  private constructor(data: DataView) {
    const reader = new DataReader(data);
    const version = reader.readUint16();
    if (version !== 0) {
      throw new Error('cmap table version must be 0');
    }
    const numTables = reader.readUint16();

    const encodingRecords = [];
    for (let i = 0; i < numTables; i++) {
      const platformID = reader.readUint16();
      const encodingID = reader.readUint16();
      const subtableOffset = reader.readUint32();
      const readSubtable = () => {
        return readEncodingRecord(subDataView(data, subtableOffset));
      };
      encodingRecords.push({ platformID, encodingID, readSubtable });
    }
    this.encodingRecords = encodingRecords;
  }
}

/**
 * Returns the most appropriate cmap subtable for Unicode text.
 */
export function selectBestCmapSubtable(cmapTable: CmapTable): CmapSubtable | undefined {
  // Based on
  // https://github.com/fonttools/fonttools/blob/main/Lib/fontTools/ttLib/tables/_c_m_a_p.py
  // > This order prefers the largest-repertoire subtable, and among
  // > those, prefers the Windows-platform over the Unicode-platform as
  // > the former has wider support.
  const preferences = [
    [3, 10], // Windows Unicode full repertoire
    [0, 6], // Unicode full repertoire (format 13 subtable)
    [0, 4], // Unicode 2.0 full repertoire
    [3, 1], // Windows Unicode BMP
    [0, 3], // Unicode 2.0 BMP
    [0, 2], // Unicode ISO/IEC 10646
    [0, 1], // Unicode 1.1
    [0, 0], // Unicode 1.0
  ];
  for (const [platformID, platEncID] of preferences) {
    const record = cmapTable.encodingRecords.find(
      (record) => record.platformID === platformID && record.encodingID === platEncID,
    );
    if (record) {
      return record.readSubtable();
    }
  }

  return undefined;
}

function readEncodingRecord(data: DataView): CmapSubtable {
  const reader = new DataReader(data);
  const format = reader.readUint16();
  reader.seek(0);
  if (format === 0) {
    return readCmapSubtableFormat0(reader);
  }

  // Format 2 is not implemented. It's only used for Japanese, Chinese,
  // and Korean characters, and according to the spec, its encoding are
  // only supported on Mac in Asia.

  if (format === 4) {
    return readCmapSubtableFormat4(reader);
  }
  if (format === 6) {
    return readCmapSubtableFormat6(reader);
  }

  // Format 8 is not implemented, it is not commonly used.

  if (format === 10) {
    return readCmapSubtableFormat10(reader);
  }
  if (format === 12 || format === 13) {
    return readCmapSubtableFormat12Or13(reader, format);
  }
  if (format === 14) {
    return readCmapSubtableFormat14(reader);
  }
  throw new Error(`cmap subtable format ${format} not supported`);
}

abstract class CmapSubtableWriter {
  readonly platformID: number;
  readonly encodingID: number;

  abstract writeSubtable(writer: DataWriter): void;

  constructor(platformID: number, encodingID: number) {
    this.platformID = platformID;
    this.encodingID = encodingID;
  }
}

export class CmapTableWriter {
  subtables: CmapSubtableWriter[] = [];

  addSubtable(subtable: CmapSubtableWriter) {
    this.subtables.push(subtable);
  }

  writeTable(writer: DataWriter) {
    const tableStart = writer.position;
    writer.writeUint16(0); // version
    const numTables = this.subtables.length;
    writer.writeUint16(numTables);
    for (let i = 0; i < numTables; i++) {
      const subtable = this.subtables[i];
      writer.writeUint16(subtable.platformID);
      writer.writeUint16(subtable.encodingID);
      writer.writeUint32(0); // subtableOffset (placeholder)
    }
    for (let i = 0; i < numTables; i++) {
      const subtableOffset = writer.position - tableStart;
      // Seek back to write the offset in the encoding record
      writer.seek(tableStart + 4 + i * 8 + 4);
      writer.writeUint32(subtableOffset);
      // Seek forward to write the subtable
      writer.seek(tableStart + subtableOffset);
      this.subtables[i].writeSubtable(writer);
    }
  }
}

// === FORMAT 0 ===

/*
 * Format 0 is a simple 1:1 mapping of exactly 256 character codes to glyph indices.
 */
export function readCmapSubtableFormat0(reader: DataReader): CmapSubtable {
  reader.readUint16(); // format
  const length = reader.readUint16();
  if (length !== 6 + 256) {
    throw new Error('Invalid length for cmap subtable format 0');
  }
  const language = reader.readUint16();
  const startGlyphIdArray = reader.position;

  function readGlyphMapping() {
    const glyphIdMap = new Map<number, number>();
    reader.seek(startGlyphIdArray);
    for (let i = 0; i < 256; i++) {
      const glyphId = reader.readUint8();
      if (glyphId !== 0) {
        glyphIdMap.set(i, glyphId);
      }
    }
    return glyphIdMap;
  }

  return { format: 0, language, readGlyphMapping };
}

// === FORMAT 4 ===

/*
 * Format 4 is a segment mapping of character codes to glyph indices.
 * It supports 16-bit character codes.
 *
 * uint16 	format
 * uint16 	length
 * uint16 	language
 * uint16 	segCountX2 	2 × segCount
 * uint16 	searchRange 	Maximum power of 2 less than or equal to segCount, times 2 ((2**floor(log2(segCount))) * 2, where “**” is an exponentiation operator)
 * uint16 	entrySelector 	Log2 of the maximum power of 2 less than or equal to segCount (log2(searchRange/2), which is equal to floor(log2(segCount)))
 * uint16 	rangeShift 	segCount times 2, minus searchRange ((segCount * 2) - searchRange)
 * uint16 	endCode[segCount] 	End characterCode for each segment, last=0xFFFF.
 * uint16 	reservedPad 	Set to 0.
 * uint16 	startCode[segCount] 	Start character code for each segment.
 * int16  	idDelta[segCount] 	Delta for all character codes in segment.
 * uint16 	idRangeOffsets[segCount] 	Offsets into glyphIdArray or 0
 * uint16 	glyphIdArray[ ] 	Glyph index array (arbitrary length)
 *
 *                      |  0 |  1 |  2 |  3 |  4 |  5 |  6 |  7 |
 * idRangeOffsets       |    :    | 00   0f |    :    |    :    |
 * glyphIdArray         |  ,-----14------´  |    :    |    :    |
 *                      |  s :    |    :    |    :    |  x :    |
 *                         `-------------c*2-------------^
 *                         ^
 *                         start of the segment
 *
 * back: idRangeOffset = glyphIndex + (segCount - segment) * 2
 *
 * (c - startCode[i]) * 2;
 *
 */
export function readCmapSubtableFormat4(reader: DataReader): CmapSubtable {
  reader.readUint16(); // format
  const length = reader.readUint16();
  const language = reader.readUint16();
  const segCount = reader.readUint16() >> 1; // stored as segCountX2
  reader.readUint16(); // searchRange
  reader.readUint16(); // entrySelector
  reader.readUint16(); // rangeShift

  const endCode = Array.from({ length: segCount }, () => reader.readUint16());
  reader.readUint16(); // reservedPad
  const startCode = Array.from({ length: segCount }, () => reader.readUint16());
  const idDelta = Array.from({ length: segCount }, () => reader.readInt16());
  // Keep the start position of idRangeOffset, we need it later.
  const idRangeOffsetPos = reader.position;
  const idRangeOffsets = Array.from({ length: segCount }, () => reader.readUint16());

  function readGlyphMapping() {
    const glyphIdMap = new Map<number, number>();
    // The last segment is always 0xffff-0xffff, it does not contain any mappings.
    for (let i = 0; i < segCount - 1; i++) {
      for (let c = startCode[i]; c <= endCode[i]; c++) {
        if (idRangeOffsets[i] !== 0) {
          // Mapping of character codes relies on glyphIdArray.
          // The offset is based on the current position within idRangeOffset.
          const currentOffset = idRangeOffsetPos + i * 2;
          // Add the character code offset from startCode to the
          // idRangeOffset (⨉ 2 for uint16).
          const glyphIndexOffset = currentOffset + idRangeOffsets[i] + (c - startCode[i]) * 2;
          // Now look up the glyph index in glyphIdArray using this index.
          if (glyphIndexOffset > length - 2) {
            throw new Error('glyphIndexOffset out of bounds');
          }
          let glyphIndex = reader.seek(glyphIndexOffset).readUint16();
          if (glyphIndex !== 0) {
            // Add the idDelta value to the glyph index, modulo 65536.
            glyphIndex = (glyphIndex + idDelta[i]) & 0xffff;
            glyphIdMap.set(c, glyphIndex);
          }
        } else {
          // Add the idDelta value directly to the character code offset,
          // modulo 65536.

          const glyphIndex = (c + idDelta[i]) & 0xffff;
          glyphIdMap.set(c, glyphIndex);
        }
      }
    }
    return glyphIdMap;
  }

  return { format: 4, language, readGlyphMapping };
}

type CmapFormat4Segment = {
  startCode: number;
  endCode: number;
  idDelta?: number;
  glyphIdOffset?: number;
};

export class CmapSubtable4Writer extends CmapSubtableWriter {
  language: number = 0;
  segments: CmapFormat4Segment[];
  glyphIds: number[];

  constructor(platformID: number, encodingID: number, segments: CmapFormat4Segment[], glyphIds: number[]) {
    super(platformID, encodingID);
    this.segments = segments;
    this.glyphIds = glyphIds;
    if (this.segments.at(-1)?.endCode !== 0xffff) {
      throw new Error('last segment must end with 0xffff');
    }
    if (this.segments.at(-1)?.startCode !== 0xffff) {
      throw new Error('last segment must start with 0xffff');
    }
  }

  writeSubtable(writer: DataWriter): void {
    writer.writeUint16(4); // format
    const length = 14 + this.segments.length * 8 + this.glyphIds.length * 2;
    writer.writeUint16(length);
    writer.writeUint16(this.language);
    const segCount = this.segments.length;
    writer.writeUint16(segCount << 1); // segCountX2
    writer.writeUint16(0); // searchRange
    writer.writeUint16(0); // entrySelector
    writer.writeUint16(0); // rangeShift
    for (let i = 0; i < segCount; i++) {
      writer.writeUint16(this.segments[i].endCode);
    }
    writer.writeUint16(0); // reservedPad
    for (let i = 0; i < segCount; i++) {
      writer.writeUint16(this.segments[i].startCode);
    }
    for (let i = 0; i < segCount; i++) {
      writer.writeUint16(this.segments[i].idDelta ?? 0);
    }
    for (let i = 0; i < segCount; i++) {
      const glyphIdOffset = this.segments[i].glyphIdOffset;
      const idRangeOffset = glyphIdOffset != null ? glyphIdOffset + (segCount - i) * 2 : 0;
      writer.writeUint16(idRangeOffset);
    }
    for (let i = 0; i < this.glyphIds.length; i++) {
      writer.writeUint16(this.glyphIds[i]);
    }
  }
}

// === FORMAT 6 ===

export function readCmapSubtableFormat6(reader: DataReader): CmapSubtable {
  reader.readUint16(); // format
  const length = reader.readUint16();
  const language = reader.readUint16();
  const firstCode = reader.readUint16();
  const entryCount = reader.readUint16();
  const glyphIdArrayStart = reader.position;
  if (length !== glyphIdArrayStart + entryCount * 2) {
    throw new Error('Invalid length for cmap subtable format 6');
  }

  function readGlyphMapping() {
    const glyphIdMap = new Map<number, number>();
    reader.seek(glyphIdArrayStart);
    for (let i = 0; i < entryCount; i++) {
      const glyphId = reader.readUint16();
      if (glyphId !== 0) {
        glyphIdMap.set(firstCode + i, glyphId);
      }
    }
    return glyphIdMap;
  }

  return { format: 6, language, readGlyphMapping };
}

// === FORMAT 10 ===

export function readCmapSubtableFormat10(reader: DataReader): CmapSubtable {
  reader.readUint16(); // format
  reader.readUint16(); // reserved
  const length = reader.readUint32();
  const language = reader.readUint32();
  const startCharCode = reader.readUint32();
  const numChars = reader.readUint32();
  const glyphIdArrayStart = reader.position;
  if (length !== glyphIdArrayStart + numChars * 2) {
    throw new Error('Invalid length for cmap subtable format 10');
  }

  function readGlyphMapping() {
    const glyphIdMap = new Map<number, number>();
    reader.seek(glyphIdArrayStart);
    for (let i = 0; i < numChars; i++) {
      const glyphId = reader.readUint16();
      if (glyphId !== 0) {
        glyphIdMap.set(startCharCode + i, glyphId);
      }
    }
    return glyphIdMap;
  }

  return { format: 10, language, readGlyphMapping };
}

// === FORMAT 12 ===

export function readCmapSubtableFormat12Or13(reader: DataReader, format: 12 | 13): CmapSubtable {
  reader.readUint16(); // format
  reader.readUint16(); // reserved
  reader.readUint32(); // length
  const language = reader.readUint32();
  const numGroups = reader.readUint32();
  const groupsStart = reader.position;
  const readGroup = (index: number) => {
    reader.seek(groupsStart + index * 12);
    return {
      startCharCode: reader.readUint32(),
      endCharCode: reader.readUint32(),
      startGlyphID: reader.readUint32(),
    };
  };

  function readGlyphMapping() {
    const glyphIdMap = new Map<number, number>();
    for (let i = 0; i < numGroups; i++) {
      const group = readGroup(i);
      for (let c = group.startCharCode; c <= group.endCharCode; c++) {
        glyphIdMap.set(c, group.startGlyphID + (format === 13 ? 0 : c - group.startCharCode));
      }
    }
    return glyphIdMap;
  }

  return { format, language, readGlyphMapping };
}

export type CmapFormat12Group = {
  startCharCode: number;
  endCharCode: number;
  startGlyphID: number;
};

export class CmapSubtable12Writer extends CmapSubtableWriter {
  readonly groups: CmapFormat12Group[];
  language = 0;

  constructor(platformID: number, encodingID: number, groups: CmapFormat12Group[]) {
    super(platformID, encodingID);
    this.groups = groups;
  }

  writeSubtable(writer: DataWriter) {
    const startPosition = writer.position;
    const numGroups = this.groups.length;
    writer.writeUint16(12); // format
    writer.writeUint16(0); // reserved
    const length = 16 + numGroups * 12;
    writer.writeUint32(length);
    writer.writeUint32(this.language);
    writer.writeUint32(numGroups);
    for (let i = 0; i < numGroups; i++) {
      writer.writeUint32(this.groups[i].startCharCode);
      writer.writeUint32(this.groups[i].endCharCode);
      writer.writeUint32(this.groups[i].startGlyphID);
    }
    if (writer.position - startPosition !== length) {
      throw new Error('Invalid length for cmap subtable format 12');
    }
  }
}

// === FORMAT 14 ===

function readCmapSubtableFormat14(reader: DataReader): CmapSubtable {
  reader.readUint16(); // format
  reader.readUint32(); // length
  const numVarSelectorRecords = reader.readUint32();
  const varSelectorRecords = Array.from({ length: numVarSelectorRecords }, () => ({
    varSelector: reader.readUint24(),
    defaultUVSOffset: reader.readUint32(),
    nonDefaultUVSOffset: reader.readUint32(),
  }));

  const uvsTable = new Map<number, number>();

  for (const record of varSelectorRecords) {
    if (record.defaultUVSOffset !== 0) {
      reader.seek(record.defaultUVSOffset);
      const numUnicodeValueRanges = reader.readUint32();
      for (let i = 0; i < numUnicodeValueRanges; i++) {
        const startUnicodeValue = reader.readUint24();
        const additionalCount = reader.readUint8();
        for (let j = 0; j < additionalCount; j++) {
          uvsTable.set(startUnicodeValue + j, startUnicodeValue + j);
        }
      }
    }
  }

  for (const record of varSelectorRecords) {
    if (record.nonDefaultUVSOffset !== 0) {
      reader.seek(record.nonDefaultUVSOffset);
      const numUVSMappings = reader.readUint32();
      for (let i = 0; i < numUVSMappings; i++) {
        const unicodeValue = reader.readUint24();
        const glyphID = reader.readUint16();
        uvsTable.set(unicodeValue, glyphID);
      }
    }
  }

  function readGlyphMapping() {
    const glyphIdMap = new Map<number, number>();
    for (const [codePoint, glyphId] of uvsTable.entries()) {
      glyphIdMap.set(codePoint, glyphId);
    }
    return glyphIdMap;
  }

  const language = 0; // Language is not used in format 14, must be set to 0
  return { format: 14, language, readGlyphMapping };
}

// === TABLE BUILDER ===

/**
 * Builder for the 'cmap' table.
 */
export class CmapTableBuilder extends TableBuilder {
  private readonly writer: CmapTableWriter;

  constructor() {
    super('cmap');
    this.writer = new CmapTableWriter();
  }

  /**
   * Adds a format 4 subtable to the cmap table.
   */
  addSubtable4(platformID: number, encodingID: number, segments: CmapFormat4Segment[], glyphIds: number[]): void {
    this.writer.addSubtable(new CmapSubtable4Writer(platformID, encodingID, segments, glyphIds));
  }

  /**
   * Adds a format 12 subtable to the cmap table.
   */
  addSubtable12(platformID: number, encodingID: number, groups: CmapFormat12Group[]): void {
    this.writer.addSubtable(new CmapSubtable12Writer(platformID, encodingID, groups));
  }

  writeTable(writer: DataWriter): void {
    this.writer.writeTable(writer);
  }
}
