/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import { type Font } from './font.ts';
import { type GlyphRun } from './glyph-run.ts';
import { resolveMarkAttachments, TextShaper } from './text-shaper.ts';

describe('TextShaper', () => {
  describe('constructor', () => {
    it('creates an instance with the provided font', () => {
      const font = createMockFont({});

      const shaper = new TextShaper(font);

      expect(shaper.font).toBe(font);
    });

    it('accepts default options', () => {
      const font = createMockFont({});

      const shaper = new TextShaper(font, { scriptTag: 'latn', langSysTag: 'ENG' });
      shaper.shape('Test');

      expect(font.tables.GSUB?.findScriptTable).toHaveBeenCalledWith('latn');
      expect(font.tables.GSUB?.findLangSysTable).toHaveBeenCalledWith({}, 'ENG ');
    });
  });

  describe('shape', () => {
    it('accepts options', () => {
      const font = createMockFont({});

      const shaper = new TextShaper(font, { scriptTag: 'latn', langSysTag: 'ENG' });
      shaper.shape('Test', { scriptTag: 'cyrl', langSysTag: 'BGR' });

      expect(font.tables.GSUB?.findScriptTable).toHaveBeenCalledWith('cyrl');
      expect(font.tables.GSUB?.findLangSysTable).toHaveBeenCalledWith({}, 'BGR ');
    });

    it('maps characters to glyph IDs', () => {
      const font = createMockFont({
        glyphMapping: new Map([
          [0x48, 10], // H
          [0x69, 20], // i
        ]),
      });
      const shaper = new TextShaper(font);

      const result = shaper.shape('Hi');

      expect(result.glyphs).toHaveLength(2);
      expect(result.glyphs[0].glyphId).toBe(10);
      expect(result.glyphs[1].glyphId).toBe(20);
    });

    it('returns glyph ID 0 for unmapped characters', () => {
      const font = createMockFont({
        glyphMapping: new Map([[0x48, 10]]),
      });
      const shaper = new TextShaper(font);

      const result = shaper.shape('HX');

      expect(result.glyphs[0].glyphId).toBe(10);
      expect(result.glyphs[1].glyphId).toBe(0); // .notdef
    });

    it('assigns advance widths from hmtx', () => {
      const font = createMockFont({
        glyphMapping: new Map([
          [0x41, 1], // A
          [0x42, 2], // B
        ]),
        advances: [0, 500, 600], // glyph 0, 1, 2
      });
      const shaper = new TextShaper(font);

      const result = shaper.shape('AB');

      expect(result.glyphs[0].advance).toBe(500);
      expect(result.glyphs[1].advance).toBe(600);
    });

    it('preserves code points in shaped glyphs', () => {
      const font = createMockFont({
        glyphMapping: new Map([
          [0x48, 10],
          [0x69, 20],
        ]),
      });
      const shaper = new TextShaper(font);

      const result = shaper.shape('Hi');

      expect(result.glyphs[0].codePoints).toEqual([0x48]);
      expect(result.glyphs[1].codePoints).toEqual([0x69]);
    });

    it('handles surrogate pairs (emoji)', () => {
      const font = createMockFont({
        glyphMapping: new Map([
          [0x1f600, 100], // 😀 grinning face
          [0x41, 10], // A
        ]),
      });
      const shaper = new TextShaper(font);

      const result = shaper.shape('A😀');

      expect(result.glyphs).toHaveLength(2);
      expect(result.glyphs[0].glyphId).toBe(10);
      expect(result.glyphs[0].codePoints).toEqual([0x41]);
      expect(result.glyphs[1].glyphId).toBe(100);
      expect(result.glyphs[1].codePoints).toEqual([0x1f600]);
    });

    it('handles empty string', () => {
      const font = createMockFont({});
      const shaper = new TextShaper(font);

      const result = shaper.shape('');

      expect(result.glyphs).toEqual([]);
    });

    it('rejects invalid scriptTag', () => {
      const font = createMockFont({});
      const shaper = new TextShaper(font);

      expect(() => shaper.shape('A', { scriptTag: '' })).toThrow('Invalid scriptTag');
      expect(() => shaper.shape('A', { scriptTag: ' ' })).toThrow('Invalid scriptTag');
      expect(() => shaper.shape('A', { scriptTag: 'A B' })).toThrow('Invalid scriptTag');
      expect(() => shaper.shape('A', { scriptTag: 'TOOLONG' })).toThrow('Invalid scriptTag');
    });

    it('rejects invalid langSysTag', () => {
      const font = createMockFont({});
      const shaper = new TextShaper(font);

      expect(() => shaper.shape('A', { langSysTag: '' })).toThrow('Invalid langSysTag');
      expect(() => shaper.shape('A', { langSysTag: ' ' })).toThrow('Invalid langSysTag');
      expect(() => shaper.shape('A', { langSysTag: 'A B' })).toThrow('Invalid langSysTag');
      expect(() => shaper.shape('A', { langSysTag: 'TOOLONG' })).toThrow('Invalid langSysTag');
    });

    it('works when font has no GSUB table', () => {
      const font = createMockFont({
        glyphMapping: new Map([[0x41, 1]]),
        advances: [0, 500],
      });
      const shaper = new TextShaper(font);

      const result = shaper.shape('A');

      expect(result.glyphs[0]).toEqual({
        glyphId: 1,
        codePoints: [0x41],
        advance: 500,
      });
    });

    it('works when font has no GPOS table', () => {
      const font = createMockFont({
        glyphMapping: new Map([[0x41, 1]]),
        advances: [0, 500],
      });
      const shaper = new TextShaper(font);

      const result = shaper.shape('A');

      expect(result.glyphs[0].advance).toBe(500);
      expect(result.glyphs[0].advanceAdjust).toBeUndefined();
    });
  });
});

type MockFontOptions = {
  glyphMapping?: Map<number, number>;
  advances?: number[];
};

describe('resolveMarkAttachments', () => {
  it('resolves horizontal offsets and keeps vertical offsets of attached marks', () => {
    // The mark was attached with offsets relative to the base origin. The
    // base was shifted afterward, e.g. by a later lookup.
    const glyphRun: GlyphRun = {
      glyphs: [
        { glyphId: 10, codePoints: [97], advance: 600, xOffset: 30, yOffset: 100 },
        { glyphId: 100, codePoints: [769], advance: 0, xOffset: 250, yOffset: 550 },
      ],
    };

    resolveMarkAttachments(glyphRun, new Map([[1, 0]]));

    expect(glyphRun.glyphs[1].xOffset).toBe(-320); // 250 + 30 - 600
    expect(glyphRun.glyphs[1].yOffset).toBe(550);
  });
});

function createMockFont(options: MockFontOptions): Font {
  const { glyphMapping = new Map(), advances = [] } = options;

  return {
    glyphMapping,
    tables: {
      hmtx: {
        hMetrics: {
          at: (index: number) => {
            const advanceWidth = advances[index];
            return advanceWidth !== undefined ? { advanceWidth } : undefined;
          },
        },
      },
      GSUB: {
        findScriptTable: vi.fn().mockReturnValue({}),
        findLangSysTable: vi.fn(),
      },
      GPOS: {
        findScriptTable: vi.fn().mockReturnValue({}),
        findLangSysTable: vi.fn(),
      },
    },
  } as unknown as Font;
}
