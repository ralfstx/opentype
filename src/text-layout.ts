import { type Font } from './font.ts';
import { type GlyphRun, type PositionedGlyph } from './glyph-run.ts';
import { readGposSubtable } from './tables/gpos.ts';
import { readGsubSubtable } from './tables/gsub.ts';

export class TextLayout {
  readonly font: Font;
  readonly script: string;
  readonly language: string;

  constructor(font: Font, script: string, language: string) {
    this.font = font;
    this.script = script;
    this.language = language;
  }

  layout(text: string) {
    const glyphRun = this.createGlyphRun(text);
    this.applyGsub(glyphRun);
    this.applyGpos(glyphRun);
    return glyphRun;
  }

  createGlyphRun(text: string): GlyphRun {
    const glyphs: PositionedGlyph[] = [];

    for (const character of text) {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined) {
        throw new Error('Invalid character in string: ' + character);
      }
      // By OpenType convention, glyph ID 0 is reserved for the .notdef glyph
      const glyphId = this.font.lookupGlyphId(codePoint) ?? 0;
      glyphs.push({ glyphId });
    }

    return { glyphs };
  }

  private applyGsub(glyphRun: GlyphRun): void {
    const desiredFeatures = ['ccmp', 'liga', 'clig', 'calt', 'locl', 'rlig'];

    const gsub = this.font.tables.gsub;
    if (!gsub) return;

    const langSysTable = gsub.findLangSysTable(this.script, this.language);
    if (!langSysTable) return;

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = gsub.featureListTable.featureRecords[featureIndex];
      if (!desiredFeatures.includes(featureRec.featureTag)) {
        continue;
      }

      const featureTable = featureRec.featureTable;

      for (const lookupIndex of featureTable?.lookupListIndices ?? []) {
        const lookupTable = gsub.lookupListTable.readLookupTable(lookupIndex);
        if (lookupTable === undefined) continue;
        for (let i = 0; i < lookupTable.subTableCount; i++) {
          readGsubSubtable(lookupTable, i)?.applyToGlyphRun(glyphRun);
        }
      }
    }
  }

  private applyGpos(glyphRun: GlyphRun): void {
    const gpos = this.font.tables.gpos;
    if (!gpos) return;

    const desiredFeatures = ['kern'];

    const langSysTable = gpos.findLangSysTable(this.script, this.language);
    if (!langSysTable) return;

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = gpos.featureListTable.featureRecords[featureIndex];
      if (!desiredFeatures.includes(featureRec.featureTag)) {
        continue;
      }

      const featureTable = featureRec.featureTable;

      for (const lookupIndex of featureTable?.lookupListIndices ?? []) {
        const lookupTable = gpos.lookupListTable.readLookupTable(lookupIndex);
        if (lookupTable === undefined) continue;
        for (let i = 0; i < lookupTable.subTableCount; i++) {
          readGposSubtable(lookupTable, i)?.applyToGlyphRun(glyphRun);
        }
      }
    }
  }
}
