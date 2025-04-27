import { DataReader } from 'src/data-reader.ts';
import { type DataWriter } from 'src/data-writer.ts';
import { TableBuilder } from 'src/table-builder.ts';
import { type HeadTable } from 'src/tables/head.ts';
import { type MaxpTable } from 'src/tables/maxp.ts';

/**
 * The `loca` table stores the offsets of the glyphs, relative to the
 * beginning of the glyph data table.
 *
 * There are two versions of this table, a long version that stores the
 * offsets as uint32, and a short version that stores offsets divided by
 * 2 as uint16. The version is specified in the `indexToLocFormat` field
 * in the 'head' table.
 *
 * The number of entries in the `loca` table is `numGlyphs + 1`, where
 * `numGlyphs` is the number of glyphs in the font, defined in the
 * `maxp` table. The first entry always refers to the "missing
 * character" glyph.
 */
export class LocaTable {
  readonly offsets: number[];

  static read(data: DataView, head: HeadTable, maxp: MaxpTable): LocaTable {
    const long = head.indexToLocFormat === 1;
    const numGlyphs = maxp.numGlyphs;
    return new LocaTable(data, numGlyphs, long);
  }

  private constructor(data: DataView, numGlyphs: number, long?: boolean) {
    const reader = new DataReader(data);
    const read = long ? () => reader.readUint32() : () => reader.readUint16() << 1;
    this.offsets = Array.from({ length: numGlyphs + 1 }, read);
  }
}

export class LocaTableBuilder extends TableBuilder {
  readonly format: 'short' | 'long';
  readonly offsets: number[];

  static shortFormat(offsets?: number[]): LocaTableBuilder {
    return new LocaTableBuilder('short', offsets);
  }

  static longFormat(offsets?: number[]): LocaTableBuilder {
    return new LocaTableBuilder('long', offsets);
  }

  static forOffsets(offsets: number[]): LocaTableBuilder {
    const long = offsets[offsets.length - 1] > 65535;
    return long ? LocaTableBuilder.longFormat(offsets) : LocaTableBuilder.shortFormat(offsets);
  }

  private constructor(format: 'short' | 'long', offsets?: number[]) {
    super('loca');
    this.format = format;
    this.offsets = offsets ?? [];
  }

  writeTable(writer: DataWriter): void {
    const write =
      this.format === 'long'
        ? (n: number) => writer.writeUint32(n)
        : (n: number) => writer.writeUint16(n >> 2);
    for (let i = 0, len = this.offsets.length; i < len; i++) {
      write(this.offsets[i]);
    }
  }
}
