import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { getEncoding } from 'src/encoding.ts';
import { getLanguage, getLanguageID } from 'src/languages.ts';
import { TableBuilder } from 'src/table-builder.ts';

// https://learn.microsoft.com/en-us/typography/opentype/spec/name#name-ids
export const nameIDs = {
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
};

type NameRecord = {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  length: number;
  stringOffset: number;
  language?: string;
  encoding?: string;
};

type LangTagRecord = {
  length: number;
  langTagOffset: number;
};

export class NameTable {
  readonly data: DataView;
  readonly version: number;
  readonly storageOffset: number;
  readonly nameRecords: NameRecord[];
  readonly langTags: string[] = [];

  constructor(data: DataView) {
    this.data = data;
    const reader = new DataReader(data);
    this.version = reader.readUint16();
    const count = reader.readUint16();
    this.storageOffset = reader.readUint16();
    this.nameRecords = Array.from({ length: count }, () => this.#readNameRecord(reader));
    if (this.version === 1) {
      const langTagCount = reader.readUint16();
      const langTagRecords = Array.from({ length: langTagCount }, () => readLangTagRecord(reader));
      for (const record of langTagRecords) {
        const offset = this.storageOffset + record.langTagOffset;
        const string = reader.reset(offset).readUtf16BE(record.length);
        this.langTags.push(string);
      }
    }
  }

  findName(nameID: number, ...languages: string[]) {
    for (const language of languages) {
      const found = this.nameRecords.find(
        (rec) => rec.encoding && rec.nameID === nameID && rec.language === language
      );
      if (found) return { string: this.#readString(found), language };
    }
    const found = this.nameRecords.find((rec) => rec.encoding && rec.nameID === nameID);
    if (found) return { string: this.#readString(found), language: found.language };
  }

  getAllNames() {
    return this.nameRecords.map((rec) => ({
      string: this.#readString(rec),
      language: rec.language,
    }));
  }

  #readString(record: NameRecord): string {
    const reader = new DataReader(this.data);
    const offset = this.storageOffset + record.stringOffset;
    const bytes = reader.reset(offset).readBytes(record.length);
    if (!record.encoding) throw new Error('Unknown encoding');
    return new TextDecoder(record.encoding).decode(new Uint8Array(bytes));
  }

  #readNameRecord(reader: DataReader): NameRecord {
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

    return {
      platformID,
      encodingID,
      languageID,
      nameID,
      length,
      stringOffset,
      language,
      encoding,
    };
  }
}

function readLangTagRecord(reader: DataReader): LangTagRecord {
  return {
    length: reader.readUint16(),
    langTagOffset: reader.readUint16(),
  };
}

export function readNameTable(data: DataView): NameTable {
  return new NameTable(data);
}

type WriteNameRecord = {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  string: string;
};

export class NameTableBuilder extends TableBuilder {
  #records: WriteNameRecord[] = [];
  #langTags?: string[];

  constructor() {
    super('name');
  }

  addName(nameID: number, string: string, language: string) {
    const platformID = 3; // Windows, most common
    const encodingID = 1; // Unicode BMP
    let languageID = getLanguageID(platformID, language);
    if (languageID === undefined) {
      this.#langTags ??= [];
      let langTagIndex = this.#langTags.indexOf(language);
      if (langTagIndex === -1) {
        this.#langTags.push(language);
        langTagIndex = this.#langTags.length - 1;
      }
      languageID = langTagIndex + 0x8000;
    }
    this.#records.push({ platformID, encodingID, languageID, nameID, string });
    return this;
  }

  writeTable(writer: DataWriter) {
    const version = this.#langTags?.length ? 1 : 0;
    const count = this.#records.length;
    writer.writeUint16(version);
    writer.writeUint16(count);
    const storageOffset =
      6 + 12 * count + (version === 1 ? 2 : 0) + 4 * (this.#langTags?.length ?? 0);
    writer.writeUint16(storageOffset);

    let stringOffset = 0;
    for (const record of this.#records) {
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
      writer.writeUint16(this.#langTags?.length ?? 0);
      for (const langTag of this.#langTags ?? []) {
        const length = langTag.length * 2;
        writer.writeUint16(length);
        writer.writeUint16(stringOffset);
        stringOffset += length;
      }
    }

    for (const record of this.#records) {
      writer.writeUtf16BE(record.string);
    }
    if (version === 1) {
      for (const langTag of this.#langTags ?? []) {
        writer.writeUtf16BE(langTag);
      }
    }
  }
}
