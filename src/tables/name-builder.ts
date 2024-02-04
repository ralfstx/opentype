import { DataWriter } from 'src/data-writer.ts';
import { getLanguageID } from 'src/languages.ts';
import { TableBuilder } from 'src/table-builder.ts';

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
