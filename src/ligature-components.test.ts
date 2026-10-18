import { describe, expect, it } from 'vitest';

import { type ShapedGlyph } from './glyph-run.ts';
import { ligatureComponents, recordLigature } from './ligature-components.ts';

describe('recordLigature', () => {
  it('assigns glyphs between components to the component they follow', () => {
    const [f, acute, i, ligature] = createGlyphs(4);

    recordLigature([f, acute, i], [0, 2], ligature);

    expect(ligatureComponents.get(acute)).toEqual({ ligature, index: 0 });
  });

  it('counts the components of ligatures that are components themselves', () => {
    // f f acute i: "ff" is formed first, then "ffi" from "ff" and "i"
    const [f1, f2, acute, i, ff, ffi] = createGlyphs(6);
    recordLigature([f1, f2], [0, 1], ff);

    recordLigature([ff, acute, i], [0, 2], ffi);

    expect(ligatureComponents.get(acute)).toEqual({ ligature: ffi, index: 1 });
  });

  it('carries over glyphs assigned to a ligature that becomes a component', () => {
    // f acute f i: "ff" is formed around the acute, then "ffi"
    const [f1, acute, f2, i, ff, ffi] = createGlyphs(6);
    recordLigature([f1, acute, f2], [0, 2], ff);

    recordLigature([ff, acute, i], [0, 2], ffi);

    expect(ligatureComponents.get(acute)).toEqual({ ligature: ffi, index: 0 });
  });

  it('keeps the component for a ligature formed from marks of the same component', () => {
    // f acute dot i: "fi" is formed around both marks, then the marks are
    // combined into a single mark glyph
    const [f, acute, dot, i, fi, acuteDot] = createGlyphs(6);
    recordLigature([f, acute, dot, i], [0, 3], fi);

    recordLigature([fi, acute, dot], [1, 2], acuteDot);

    expect(ligatureComponents.get(acuteDot)).toEqual({ ligature: fi, index: 0 });
  });

  it('does not reassign glyphs skipped between the marks of a mark ligature', () => {
    // f a b c i: "fi" is formed around the marks a, b, and c, then a and c
    // are combined while b is skipped
    const [f, a, b, c, i, fi, ac] = createGlyphs(7);
    recordLigature([f, a, b, c, i], [0, 4], fi);

    recordLigature([fi, a, b, c], [1, 3], ac);

    expect(ligatureComponents.get(ac)).toEqual({ ligature: fi, index: 0 });
    expect(ligatureComponents.get(b)).toEqual({ ligature: fi, index: 0 });
  });

  it('carries over glyphs after the last component that belong to it', () => {
    // x f acute f: "ff" is formed around the acute, then "xff" from "x" and "ff"
    const [x, f1, acute, f2, ff, xff] = createGlyphs(6);
    recordLigature([f1, acute, f2], [0, 2], ff);
    const other = createGlyphs(1)[0];

    recordLigature([x, ff, acute, other], [0, 1], xff);

    expect(ligatureComponents.get(acute)).toEqual({ ligature: xff, index: 1 });
    expect(ligatureComponents.get(other)).toBeUndefined();
  });
});

function createGlyphs(count: number): ShapedGlyph[] {
  return Array.from({ length: count }, (_, index) => ({ glyphId: index, codePoints: [], advance: 0 }));
}
