import { DataReader } from '../data-reader.ts';
import { type DataWriter } from '../data-writer.ts';
import { getEncoding } from '../encoding.ts';
import { getLanguage, getLanguageID } from '../languages.ts';
import { TableBuilder } from '../table-builder.ts';

/**
 * Name IDs as per the OpenType specification.
 */
// https://learn.microsoft.com/en-us/typography/opentype/spec/name#name-ids
export const NameIDs = {
  copyrightNotice: 0,
  fontFamilyName: 1,
  fontSubfamilyName: 2,
  uniqueFontIdentifier: 3,
  fullFontName: 4,
  versionString: 5,
  postscriptName: 6,
  trademark: 7,
  manufacturerName: 8,
  designer: 9,
  description: 10,
  urlVendor: 11,
  urlDesigner: 12,
  licenseDescription: 13,
  licenseInfoURL: 14,
  reserved: 15,
  typographicFamilyName: 16,
  typographicSubfamilyName: 17,
  compatibleFullName: 18,
  sampleText: 19,
  postscriptCIDFindfontName: 20,
  wwsFamilyName: 21,
  wwsSubfamilyName: 22,
  lightBackgroundPalette: 23,
  darkBackgroundPalette: 24,
  variationsPostscriptNamePrefix: 25,
} as const;

/**
 * A record in the 'name' table.
 */
export type NameRecord = {
  /** Platform ID. */
  readonly platformID: number;
  /** The platform-specific encoding ID. */
  readonly encodingID: number;
  /** Language ID. */
  readonly languageID: number;
  /** Name ID. */
  readonly nameID: number;
  /** The BCP-47 language code of the name string. */
  readonly language: string | undefined;
  /** The encoding used for the name string. */
  readonly encoding: string | undefined;
  /** Reads the name string. */
  readonly readName: () => string;
};

/**
 * The 'name' table contains human-readable strings for various font properties.
 */
export class NameTable {
  private readonly data: DataView;
  private readonly storageOffset: number;
  private readonly langTags: string[] = [];

  /** The version of the 'name' table. */
  readonly version: number;
  /** The name records in the 'name' table. */
  readonly nameRecords: ReadonlyArray<NameRecord>;

  /**
   * Reads a 'name' table from the given DataView.
   */
  static read(data: DataView): NameTable {
    return new NameTable(data);
  }

  private constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);
    this.version = reader.readUint16();
    const count = reader.readUint16();
    this.storageOffset = reader.readUint16();
    this.nameRecords = Array.from({ length: count }, () => this.readNameRecord(reader));
    if (this.version === 1) {
      const langTagCount = reader.readUint16();
      const langTagRecords = Array.from({ length: langTagCount }, () => ({
        length: reader.readUint16(),
        langTagOffset: reader.readUint16(),
      }));
      for (const record of langTagRecords) {
        const offset = this.storageOffset + record.langTagOffset;
        const string = reader.seek(offset).readUtf16BE(record.length);
        this.langTags.push(string);
      }
    }
  }

  /**
   * Finds a name string for the given name ID, preferring English if available.
   */
  findName(nameID: number): { name: string; language?: string } | undefined {
    const record = this.findBestNameRecord(nameID);
    if (!record) return undefined;
    return {
      name: record.readName(),
      language: record.language,
    };
  }

  /**
   * Finds the best matching name record for the given name ID, preferring English if available.
   */
  private findBestNameRecord(nameID: number): NameRecord | undefined {
    // Priority list: [platformID, encodingID, languageID]
    const preferred = [
      { platformID: 3, encodingID: 1, languageID: 0x0409 }, // Windows, Unicode, English
      { platformID: 3, encodingID: 1 }, // Any Windows Unicode
      { platformID: 0 }, // Unicode (generic)
      { platformID: 1 }, // Macintosh (legacy fallback)
    ];

    // Filter records with the desired nameID
    const candidates = this.nameRecords.filter((r) => r.nameID === nameID);

    // Try each preference in order
    for (const pref of preferred) {
      const match = candidates.find((r) =>
        Object.entries(pref).every(([key, val]) => r[key as keyof typeof pref] === val),
      );
      if (match) return match;
    }

    // Fallback: return the first matching record if any
    return candidates.length > 0 ? candidates[0] : undefined;
  }

  private readNameRecord(reader: DataReader): NameRecord {
    const platformID = reader.readUint16();
    const encodingID = reader.readUint16();
    const languageID = reader.readUint16();
    const nameID = reader.readUint16();
    const length = reader.readUint16();
    const stringOffset = reader.readUint16();
    const language =
      languageID < 0x8000
        ? getLanguage(platformID, languageID)
        : this.langTags[languageID - 0x8000];
    const encoding = getEncoding(platformID, encodingID);
    const readName = () => {
      return this.readString(stringOffset, length, encoding);
    };

    return {
      platformID,
      encodingID,
      languageID,
      nameID,
      language,
      encoding,
      readName,
    };
  }

  private readString(offset: number, length: number, encoding: string | undefined): string {
    if (!encoding) throw new Error('Unknown encoding');
    const reader = new DataReader(this.data);
    const bytes = reader.seek(this.storageOffset + offset).readBytes(length);
    return new TextDecoder(encoding).decode(new Uint8Array(bytes));
  }
}

type WriteNameRecord = {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  string: string;
};

/**
 * Builder for the 'name' table.
 */
export class NameTableBuilder extends TableBuilder {
  private readonly records: WriteNameRecord[] = [];
  private langTags?: string[];

  constructor() {
    super('name');
  }

  /**
   * Adds a name record to the 'name' table.
   */
  addName(nameID: number, string: string, language: string) {
    const platformID = 3; // Windows, most common
    const encodingID = 1; // Unicode BMP
    let languageID = getLanguageID(platformID, language);
    if (languageID === undefined) {
      this.langTags ??= [];
      let langTagIndex = this.langTags.indexOf(language);
      if (langTagIndex === -1) {
        this.langTags.push(language);
        langTagIndex = this.langTags.length - 1;
      }
      languageID = langTagIndex + 0x8000;
    }
    this.records.push({ platformID, encodingID, languageID, nameID, string });
    return this;
  }

  writeTable(writer: DataWriter) {
    const version = this.langTags?.length ? 1 : 0;
    const count = this.records.length;
    writer.writeUint16(version);
    writer.writeUint16(count);
    const storageOffset =
      6 + 12 * count + (version === 1 ? 2 : 0) + 4 * (this.langTags?.length ?? 0);
    writer.writeUint16(storageOffset);

    let stringOffset = 0;
    for (const record of this.records) {
      const length = record.string.length * 2;
      writer.writeUint16(record.platformID);
      writer.writeUint16(record.encodingID);
      writer.writeUint16(record.languageID);
      writer.writeUint16(record.nameID);
      writer.writeUint16(length);
      writer.writeUint16(stringOffset);
      stringOffset += length;
    }

    if (version === 1) {
      writer.writeUint16(this.langTags?.length ?? 0);
      for (const langTag of this.langTags ?? []) {
        const length = langTag.length * 2;
        writer.writeUint16(length);
        writer.writeUint16(stringOffset);
        stringOffset += length;
      }
    }

    for (const record of this.records) {
      writer.writeUtf16BE(record.string);
    }
    if (version === 1) {
      for (const langTag of this.langTags ?? []) {
        writer.writeUtf16BE(langTag);
      }
    }
  }
}
