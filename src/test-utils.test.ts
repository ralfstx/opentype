import { describe, expect, it } from 'vitest';

import { fromHexString, toHexString } from './test-utils.ts';

describe('toHexString', () => {
  it('creates space separated hex string', () => {
    const data = new DataView(new Uint8Array([0, 1, 2, 255]).buffer);

    const result = toHexString(data);

    expect(result).toBe('00 01 02 ff');
  });

  it('creates empty string for empty data', () => {
    const data = new DataView(new Uint8Array().buffer);

    const result = toHexString(data);

    expect(result).toBe('');
  });
});

describe('fromHexString', () => {
  it('reads space separated hex string', () => {
    const result = fromHexString('00 01 02 ff');

    expect(new Uint8Array(result.buffer)).toEqual(new Uint8Array([0, 1, 2, 255]));
  });

  it('reads hex string without spaces', () => {
    const result = fromHexString('000102ff');

    expect(new Uint8Array(result.buffer)).toEqual(new Uint8Array([0, 1, 2, 255]));
  });

  it('reads empty string', () => {
    const result = fromHexString('');

    expect(new Uint8Array(result.buffer)).toEqual(new Uint8Array([]));
  });

  it('throws on odd number of chars', () => {
    expect(() => fromHexString('12345')).toThrow('Odd number of chars in hex string');
  });

  it('throws on invalid chars', () => {
    expect(() => fromHexString('01xf')).toThrow('Invalid char in hex string');
  });
});
