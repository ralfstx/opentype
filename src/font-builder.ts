import { subDataView } from './data-reader.ts';
import { DataWriter } from './data-writer.ts';
import { type TableBuilder } from './table-builder.ts';
import { type GlyfTableBuilder } from './tables/glyf.ts';
import { type HeadTableBuilder } from './tables/head.ts';
import { LocaTableBuilder } from './tables/loca.ts';
import { MaxpTableBuilder } from './tables/maxp.ts';

const supportedTables = [
  'head', // Global font information, should be first
  'hhea', // Horizontal header metrics, needed to interpret 'hmtx'
  'OS/2', // Metrics and font embedding permissions
  'glyf', // Glyph outlines
  'loca', // Glyph locations
  'maxp', // Maximum profile (limits like the number of glyphs, points, etc.)
  'hmtx', // Horizontal metrics (advance width, left side bearing)
  'cmap', // Character to glyph mapping
  'name', // Font naming table
  'post', // PostScript information
];

export class FontBuilder {
  private readonly tableBuilders: Record<string, TableBuilder> = {};
  readonly sfntVersion = 0x00010000;

  addTable(builder: TableBuilder): this {
    if (!supportedTables.includes(builder.tableTag)) {
      throw new Error(`Table ${builder.tableTag} is not supported`);
    }
    if (builder.tableTag in this.tableBuilders) {
      throw new Error(`Table ${builder.tableTag} already exists`);
    }
    this.tableBuilders[builder.tableTag] = builder;
    return this;
  }

  build() {
    const writer = new DataWriter();

    if (this.tableBuilders.glyf && !this.tableBuilders.loca) {
      // Automatically add 'loca' table if 'glyf' is present
      const locFormat = (this.tableBuilders.head as HeadTableBuilder).indexToLocFormat;
      this.tableBuilders.loca = locFormat === 0 ? LocaTableBuilder.shortFormat() : LocaTableBuilder.longFormat();
    }
    if (this.tableBuilders.glyf && !this.tableBuilders.maxp) {
      // Automatically add 'maxp' table if 'glyf' is present
      this.tableBuilders.maxp = new MaxpTableBuilder(1.0);
    }

    const tableTags = supportedTables.filter((tag) => tag in this.tableBuilders);
    const numTables = tableTags.length;

    if (!tableTags.includes('head')) {
      throw new Error('No head table present');
    }

    let headOffset = 0;

    writer.writeUint32(this.sfntVersion);
    writer.writeUint16(numTables);

    const entrySelector = Math.floor(Math.log2(numTables));
    const searchRange = Math.pow(2, entrySelector) * 16;
    const rangeShift = numTables * 16 - searchRange;
    writer.writeUint16(searchRange);
    writer.writeUint16(entrySelector);
    writer.writeUint16(rangeShift);

    const tableRecordsStart = 12;
    let tableOffset = tableRecordsStart + numTables * 16;

    for (let index = 0; index < numTables; index++) {
      writer.seek(tableOffset);
      const tableTag = tableTags[index];

      if (tableTag === 'head') headOffset = tableOffset;

      this.tableBuilders[tableTag].writeTable(writer);

      if (tableTag === 'glyf') {
        const glyfTableBuilder = this.tableBuilders.glyf as GlyfTableBuilder;
        (this.tableBuilders.loca as LocaTableBuilder).offsets = glyfTableBuilder.writtenOffsets;
        (this.tableBuilders.maxp as MaxpTableBuilder).numGlyphs = glyfTableBuilder.numGlyphs;
      }

      const length = writer.position - tableOffset;

      // pad to 4 bytes (padding is not included in table length)
      const padding = (4 - (writer.position % 4)) % 4;
      for (let i = 0; i < padding; i++) {
        writer.writeUint8(0);
      }

      // checksum is calculated on padded data
      const tableData = subDataView(writer.getData(), tableOffset, length + padding);

      // write table record
      writer.seek(tableRecordsStart + index * 16);
      writer.writeAscii(tableTag.padEnd(4, ' '));
      writer.writeUint32(this.calculateChecksum(tableData));
      writer.writeUint32(tableOffset);
      writer.writeUint32(length);
      tableOffset += length + padding;
    }

    // Temporarily set the checksumAdjustment to 0.
    writer.seek(headOffset + 8);
    writer.writeUint32(0);

    const data = writer.getData();

    // Calculate the checksum for the entire font data.
    const checksum = this.calculateChecksum(data);

    // Compute the checksumAdjustment
    const checksumAdjustment = (0xb1b0afba - checksum) >>> 0;

    // Store the checksumAdjustment in the 'head' table
    writer.seek(headOffset + 8);
    writer.writeUint32(checksumAdjustment);

    return writer.getData();
  }

  private calculateChecksum(data: DataView): number {
    if (data.byteLength % 4 !== 0) {
      throw new Error('Data length must be a multiple of 4');
    }
    let sum = 0;
    for (let i = 0; i < data.byteLength; i += 4) {
      sum = (sum + data.getUint32(i)) >>> 0;
    }
    return sum;
  }
}
