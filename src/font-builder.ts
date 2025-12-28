import { subDataView } from './data-reader.ts';
import { DataWriter } from './data-writer.ts';
import { type TableBuilder } from './table-builder.ts';

const supportedTables = [
  'head', // Global font information, should be first
  'hhea', // Horizontal header metrics, needed to interpret 'hmtx'
  'maxp', // Maximum profile (limits like the number of glyphs, points, etc.)
  'OS/2', // Metrics and font embedding permissions
  'loca', // Glyph location data (offsets for glyf)
  'glyf', // Glyph outlines
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

    const tableTags = supportedTables.filter((tag) => tag in this.tableBuilders);
    const numTables = tableTags.length;

    let headOffset = -1;

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

    if (headOffset < 0) {
      throw new Error('head table not found');
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
