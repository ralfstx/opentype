import { type ShapedGlyph } from './glyph-run.ts';

/**
 * The ligature component that a mark glyph belongs to.
 */
export type LigatureComponent = {
  /** The ligature glyph that the mark belongs to. */
  readonly ligature: ShapedGlyph;
  /** The 0-based index of the component within the ligature. */
  readonly index: number;
};

/**
 * Maps mark glyphs that were placed between the components of a ligature
 * to the component they follow, e.g. the acute in "f + acute + i" to the
 * "f" of the "fi" ligature. Recorded by GSUB ligature substitution and
 * used by GPOS mark attachment, similar to the ligature IDs in HarfBuzz.
 * A WeakMap keeps this internal information out of the shaped glyphs.
 *
 * As the information is bound to glyph objects, substitutions that replace
 * glyph objects must carry it over to the new glyphs. When a substitution
 * splits a ligature into several glyphs, marks lose their association with
 * the ligature's components (a known limitation).
 */
export const ligatureComponents = new WeakMap<ShapedGlyph, LigatureComponent>();

/**
 * The number of components of ligature glyphs. Other glyphs count as one.
 */
const componentCounts = new WeakMap<ShapedGlyph, number>();

/**
 * Records a ligature formed from the glyphs at the given positions, before
 * these glyphs are replaced. Each glyph between two components is assigned
 * to the component it follows. Components may be ligatures themselves, in
 * which case component indices are offset accordingly, and glyphs already
 * assigned to such a ligature, including those after the last component,
 * are carried over to the new ligature, as in HarfBuzz. A ligature formed
 * from marks that all belong to the same component keeps this component.
 */
export function recordLigature(
  glyphs: readonly ShapedGlyph[],
  positions: readonly number[],
  ligature: ShapedGlyph,
): void {
  const firstComponent = ligatureComponents.get(glyphs[positions[0]]);
  if (
    firstComponent &&
    positions.every((position) => sameComponent(ligatureComponents.get(glyphs[position]), firstComponent))
  ) {
    // The marks still belong to the component of the base ligature, and
    // glyphs between them keep their own association
    ligatureComponents.set(ligature, firstComponent);
    return;
  }

  let offset = 0;
  for (let k = 0; k < positions.length; k++) {
    const component = glyphs[positions[k]];
    const count = componentCounts.get(component) ?? 1;
    const isLast = k === positions.length - 1;
    const end = isLast ? glyphs.length : positions[k + 1];
    for (let j = positions[k] + 1; j < end; j++) {
      const assigned = ligatureComponents.get(glyphs[j]);
      if (assigned?.ligature === component) {
        ligatureComponents.set(glyphs[j], { ligature, index: offset + assigned.index });
      } else if (!isLast) {
        ligatureComponents.set(glyphs[j], { ligature, index: offset + count - 1 });
      } else {
        break;
      }
    }
    offset += count;
  }
  componentCounts.set(ligature, offset);
}

function sameComponent(a: LigatureComponent | undefined, b: LigatureComponent): boolean {
  return a?.ligature === b.ligature && a.index === b.index;
}
