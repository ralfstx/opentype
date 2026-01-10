import { describe, expect, it } from 'vitest';

import { type Font } from './font.ts';
import { TextShaper } from './text-shaper.ts';

describe('TextShaper', () => {
  describe('shape', () => {
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
      GSUB: undefined,
      GPOS: undefined,
    },
  } as unknown as Font;
}
