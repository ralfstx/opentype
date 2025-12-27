import { describe, expect, it } from 'vitest';

import { getEncoding } from './encoding.ts';
import { fromHexString } from './test-utils.ts';

describe('TextDecoder', () => {
  it('supports utf-16be encoding', () => {
    const result = new TextDecoder('utf-16be').decode(
      fromHexString(
        '00 61', // U+0061 (LATIN SMALL LETTER A)
        '2a 09', // U+2A09 (N-ARY TIMES OPERATOR)
        'd8 34 dd 1e', // U+1D11E (MUSICAL SYMBOL G CLEF)
      ),
    );

    expect(result).toBe('a⨉𝄞');
  });

  it('supports macintosh encoding', () => {
    const bytes = Uint8Array.from([
      0x61, // U+0041 (LATIN SMALL LETTER A)
      0x8e, // U+00E9 (LATIN SMALL LETTER E WITH ACUTE)
      0xd0, // U+2013 (EN DASH)
      0xaa, // U+2122 (TRADE MARK SIGN)
    ]);

    const result = new TextDecoder('macintosh').decode(bytes);

    expect(result).toBe('aé–™');
  });
});

describe('getEncoding', () => {
  it('returns "utf-16be" for platformID 0', () => {
    expect(getEncoding(0, 0)).toBe('utf-16be');
  });

  it('returns "utf-16be" for platformID 3 and encodingIDs 1, 10', () => {
    expect(getEncoding(3, 1)).toBe('utf-16be');
    expect(getEncoding(3, 10)).toBe('utf-16be');
  });

  it('returns "macintosh" for platformID 1 and encodingID 0', () => {
    expect(getEncoding(1, 0)).toBe('macintosh');
  });

  it('returns undefined for other combinations', () => {
    expect(getEncoding(1, 3)).toBeUndefined();
  });
});
