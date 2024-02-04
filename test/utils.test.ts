import { fromHexString, toHexString } from 'test/utils.ts';
import { describe, expect, test } from 'vitest';

describe('toHexString', () => {
  test('creates space separated hex string', () => {
    const data = new DataView(new Uint8Array([0, 1, 2, 255]).buffer);

    const result = toHexString(data);

    expect(result).toBe('00 01 02 ff');
  });

  test('creates empty string for empty data', () => {
    const data = new DataView(new Uint8Array().buffer);

    const result = toHexString(data);

    expect(result).toBe('');
  });
});

describe('fromHexString', () => {
  test('reads space separated hex string', () => {
    const result = fromHexString('00 01 02 ff');

    expect(new Uint8Array(result.buffer)).toEqual(new Uint8Array([0, 1, 2, 255]));
  });

  test('reads hex string without spaces', () => {
    const result = fromHexString('000102ff');

    expect(new Uint8Array(result.buffer)).toEqual(new Uint8Array([0, 1, 2, 255]));
  });

  test('reads empty string', () => {
    const result = fromHexString('');

    expect(new Uint8Array(result.buffer)).toEqual(new Uint8Array([]));
  });

  test('throws on odd number of chars', () => {
    expect(() => fromHexString('12345')).toThrow('Odd number of chars in hex string');
  });

  test('throws on invalid chars', () => {
    expect(() => fromHexString('01xf')).toThrow('Invalid char in hex string');
  });
});
