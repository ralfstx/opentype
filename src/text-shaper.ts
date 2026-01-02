import { type Font } from './font.ts';
import { type GlyphRun, type ShapedGlyph } from './glyph-run.ts';
import { readGposSubtable } from './tables/gpos.ts';
import { readGsubSubtable } from './tables/gsub.ts';

export class TextShaper {
  readonly font: Font;
  readonly script: string;
  readonly language: string;

  constructor(font: Font, script: string, language: string) {
    this.font = font;
    this.script = script;
    this.language = language;
  }

  shape(text: string): GlyphRun {
    const glyphRun = this.createGlyphRun(text);
    this.applyGsub(glyphRun);
    this.applyGpos(glyphRun);
    return glyphRun;
  }

  private createGlyphRun(text: string): GlyphRun {
    const glyphs: ShapedGlyph[] = [];

    for (const char of text) {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) {
        throw new Error('Invalid character in string: ' + char);
      }
      // By OpenType convention, glyph ID 0 is reserved for the .notdef glyph
      const glyphId = this.font.glyphMapping?.get(codePoint) ?? 0;
      const advance = this.getAdvance(glyphId);

      glyphs.push({ glyphId, codePoints: [codePoint], advance });
    }

    return { glyphs };
  }

  private getAdvance(glyphId: number): number {
    return this.font.tables.hmtx?.hMetrics.at(glyphId)?.advanceWidth ?? 0;
  }

  private applyGsub(glyphRun: GlyphRun): void {
    const desiredFeatures = ['ccmp', 'liga', 'clig', 'calt', 'locl', 'rlig'];

    const gsub = this.font.tables.GSUB;
    if (!gsub) return;

    const langSysTable = gsub.findLangSysTable(this.script, this.language);
    if (!langSysTable) return;

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = gsub.featureListTable.featureRecords[featureIndex];
      if (!desiredFeatures.includes(featureRec.featureTag)) {
        continue;
      }

      const featureTable = featureRec.readFeatureTable();

      for (const lookupIndex of featureTable?.lookupListIndices ?? []) {
        const lookupTable = gsub.lookupListTable.readLookupTable(lookupIndex);
        if (lookupTable === undefined) continue;
        for (let i = 0; i < lookupTable.subTableCount; i++) {
          readGsubSubtable(lookupTable, i)?.applyToGlyphRun(glyphRun, (glyphId) => this.getAdvance(glyphId));
        }
      }
    }
  }

  private applyGpos(glyphRun: GlyphRun): void {
    const gpos = this.font.tables.GPOS;
    if (!gpos) return;

    const desiredFeatures = ['kern'];

    const langSysTable = gpos.findLangSysTable(this.script, this.language);
    if (!langSysTable) return;

    for (const featureIndex of langSysTable.featureIndices) {
      const featureRec = gpos.featureListTable.featureRecords[featureIndex];
      if (!desiredFeatures.includes(featureRec.featureTag)) {
        continue;
      }

      const featureTable = featureRec.readFeatureTable();

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
