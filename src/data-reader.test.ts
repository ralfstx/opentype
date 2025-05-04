import { DataReader, subDataView } from 'src/data-reader.ts';
import { fromHexString } from 'test/utils.ts';
import { describe, expect, it } from 'vitest';

describe('DataReader', () => {
  describe('constructor', () => {
    it('initializes position to zero', () => {
      const data = fromHexString('01 02 03');

      const reader = new DataReader(data);

      expect(reader.position).toBe(0);
    });
  });

  describe('position', () => {
    it('returns the current position', () => {
      const reader = new DataReader(fromHexString('01 02 03'));

      reader.readUint8();

      expect(reader.position).toBe(1);
    });
  });

  describe('seek', () => {
    it('sets the position to the specified value', () => {
      const reader = new DataReader(fromHexString('01 02 03 04'));
      reader.readUint16();

      reader.seek(1);

      expect(reader.position).toBe(1);
    });

    it('allows seeking to the end of the data', () => {
      const reader = new DataReader(fromHexString('01 02 03'));

      reader.seek(3);

      expect(reader.position).toBe(3);
    });

    it('returns the reader itself', () => {
      const reader = new DataReader(fromHexString('01 02 03'));

      const result = reader.seek(1);

      expect(result).toBe(reader);
    });

    it('throws RangeError when seeking before the start', () => {
      const reader = new DataReader(fromHexString('01 02 03'));

      expect(() => reader.seek(-1)).toThrow(RangeError);
    });

    it('throws RangeError when seeking after the end', () => {
      const reader = new DataReader(fromHexString('01 02 03'));

      expect(() => reader.seek(4)).toThrow(RangeError);
    });

    it('does not change position on error', () => {
      const reader = new DataReader(fromHexString('01 02 03'));
      reader.readUint8(); // position = 1

      try {
        reader.seek(4);
      } catch {
        // Expected to throw
      }

      expect(reader.position).toBe(1);
    });
  });

  describe('readUint8', () => {
    it('reads an unsigned 8-bit integer', () => {
      const reader = new DataReader(fromHexString('00 ff'));

      expect(reader.readUint8()).toBe(0);
      expect(reader.readUint8()).toBe(255);
    });

    it('advances position by 1', () => {
      const reader = new DataReader(fromHexString('ab'));

      reader.readUint8();

      expect(reader.position).toBe(1);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00'));
      reader.seek(1);

      expect(() => reader.readUint8()).toThrow(RangeError);
    });
  });

  describe('readInt8', () => {
    it('reads a signed 8-bit integer', () => {
      const reader = new DataReader(fromHexString('80 7f 00'));

      expect(reader.readInt8()).toBe(-128);
      expect(reader.readInt8()).toBe(127);
      expect(reader.readInt8()).toBe(0);
    });

    it('advances position by 1', () => {
      const reader = new DataReader(fromHexString('ab'));

      reader.readInt8();

      expect(reader.position).toBe(1);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00'));
      reader.seek(1);

      expect(() => reader.readInt8()).toThrow(RangeError);
    });
  });

  describe('readUint16', () => {
    it('reads an unsigned 16-bit integer (big-endian)', () => {
      const reader = new DataReader(fromHexString('00 01 ff ff 12 34'));

      expect(reader.readUint16()).toBe(1);
      expect(reader.readUint16()).toBe(65535);
      expect(reader.readUint16()).toBe(0x1234);
    });

    it('advances position by 2', () => {
      const reader = new DataReader(fromHexString('ab cd'));

      reader.readUint16();

      expect(reader.position).toBe(2);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00')); // 1 byte

      expect(() => reader.readUint16()).toThrow(RangeError);
    });
  });

  describe('readInt16', () => {
    it('reads a signed 16-bit integer (big-endian)', () => {
      const reader = new DataReader(fromHexString('00 01 ff ff 80 00'));

      expect(reader.readInt16()).toBe(1);
      expect(reader.readInt16()).toBe(-1);
      expect(reader.readInt16()).toBe(-32768);
    });

    it('advances position by 2', () => {
      const reader = new DataReader(fromHexString('ab cd'));

      reader.readInt16();

      expect(reader.position).toBe(2);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00')); // 1 byte

      expect(() => reader.readInt16()).toThrow(RangeError);
    });
  });

  describe('readUint24', () => {
    it('reads an unsigned 24-bit integer (big-endian)', () => {
      const reader = new DataReader(fromHexString('00 00 01 ff ff ff 12 34 56'));

      expect(reader.readUint24()).toBe(1);
      expect(reader.readUint24()).toBe(0xffffff);
      expect(reader.readUint24()).toBe(0x123456);
    });

    it('advances position by 3', () => {
      const reader = new DataReader(fromHexString('ab cd ef'));

      reader.readUint24();

      expect(reader.position).toBe(3);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00 01')); // 2 bytes

      expect(() => reader.readUint24()).toThrow(RangeError);
    });
  });

  describe('readUint32', () => {
    it('reads an unsigned 32-bit integer (big-endian)', () => {
      const reader = new DataReader(fromHexString('00 00 00 01 ff ff ff ff 12 34 56 78'));

      expect(reader.readUint32()).toBe(1);
      expect(reader.readUint32()).toBe(4294967295);
      expect(reader.readUint32()).toBe(0x12345678);
    });

    it('advances position by 4', () => {
      const reader = new DataReader(fromHexString('ab cd ef 01'));

      reader.readUint32();

      expect(reader.position).toBe(4);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00 01 02')); // 3 bytes

      expect(() => reader.readUint32()).toThrow(RangeError);
    });
  });

  describe('readInt32', () => {
    it('reads a signed 32-bit integer (big-endian)', () => {
      const reader = new DataReader(fromHexString('00 00 00 01 ff ff ff ff 80 00 00 00'));

      expect(reader.readInt32()).toBe(1);
      expect(reader.readInt32()).toBe(-1);
      expect(reader.readInt32()).toBe(-2147483648);
    });

    it('advances position by 4', () => {
      const reader = new DataReader(fromHexString('ab cd ef 01'));

      reader.readInt32();

      expect(reader.position).toBe(4);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00 01 02')); // 3 bytes

      expect(() => reader.readInt32()).toThrow(RangeError);
    });
  });

  describe('readFixed', () => {
    it('reads a 32-bit fixed-point number (16.16)', () => {
      // The sequence 00 01 33 33 is included to test the rounding
      // Without rounding it would yield 1.1999969482421875
      const reader = new DataReader(fromHexString('00 01 33 33 ff ff c0 00 00 00 80 00'));

      expect(reader.readFixed()).toBe(1.2);
      expect(reader.readFixed()).toBe(-0.25);
      expect(reader.readFixed()).toBe(0.5);
    });

    it('advances position by 4', () => {
      const reader = new DataReader(fromHexString('ab cd ef 01'));

      reader.readFixed();

      expect(reader.position).toBe(4);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00 01 02')); // 3 bytes

      expect(() => reader.readFixed()).toThrow(RangeError);
    });
  });

  describe('readBytes', () => {
    it('reads the specified number of bytes into an array', () => {
      const reader = new DataReader(fromHexString('00 01 ff ab cd'));

      expect(reader.readBytes(0)).toEqual(new Uint8Array());
      expect(reader.readBytes(3)).toEqual(new Uint8Array([0, 1, 255]));
      expect(reader.readBytes(2)).toEqual(new Uint8Array([0xab, 0xcd]));
    });

    it('advances position by the number of bytes read', () => {
      const reader = new DataReader(fromHexString('00 01 02 03 04'));

      reader.readBytes(3);

      expect(reader.position).toBe(3);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00 01'));

      expect(() => reader.readBytes(3)).toThrow(RangeError);
    });
  });

  describe('readAscii', () => {
    it('reads the specified number of bytes and decodes as ASCII', () => {
      const reader = new DataReader(fromHexString('61 20 62')); // "a⨉b"

      expect(reader.readAscii(0)).toBe('');
      expect(reader.readAscii(3)).toBe('a b');
    });

    it('advances position by the number of bytes read', () => {
      const reader = new DataReader(fromHexString('61 62 63'));

      reader.readAscii(2);

      expect(reader.position).toBe(2);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('61 62')); // 2 bytes

      expect(() => reader.readAscii(3)).toThrow(RangeError);
    });
  });

  describe('readUtf16BE', () => {
    it('reads the specified number of bytes and decodes as UTF-16BE', () => {
      const reader = new DataReader(fromHexString('00 61 2a 09 00 62'));

      expect(reader.readUtf16BE(0)).toBe('');
      expect(reader.readUtf16BE(6)).toBe('a⨉b');
    });

    it('advances position by the number of bytes read', () => {
      const reader = new DataReader(fromHexString('00 61 00 62 00 63'));

      reader.readUtf16BE(4);

      expect(reader.position).toBe(4);
    });

    it('throws RangeError on out-of-bounds access', () => {
      const reader = new DataReader(fromHexString('00 61 00')); // 3 bytes

      expect(() => reader.readUtf16BE(4)).toThrow(RangeError);
    });
  });
});

describe('subDataView', () => {
  it('creates a new DataView with the specified offset and length', () => {
    const data = fromHexString('00 01 02 03 04 05');

    const subView = subDataView(data, 2, 3);

    expect(subView.byteLength).toBe(3);
    expect(subView.getUint8(0)).toBe(2);
    expect(subView.getUint8(1)).toBe(3);
    expect(subView.getUint8(2)).toBe(4);
  });

  it('creates a new DataView with the specified offset and no length', () => {
    const data = fromHexString('00 01 02 03 04 05');

    const subView = subDataView(data, 2);

    expect(subView.byteLength).toBe(4);
    expect(subView.getUint8(0)).toBe(2);
    expect(subView.getUint8(1)).toBe(3);
    expect(subView.getUint8(2)).toBe(4);
    expect(subView.getUint8(3)).toBe(5);
  });

  it('creates an empty DataView', () => {
    const data = fromHexString('00 01 02 03 04 05');

    const subView = subDataView(data, 2, 0);

    expect(subView.byteLength).toBe(0);
  });

  it('throws RangeError when offset is negative', () => {
    const data = fromHexString('00');

    expect(() => subDataView(data, -1)).toThrow(RangeError);
  });

  it('throws RangeError when offset is greater than data length', () => {
    const data = fromHexString('00');

    expect(() => subDataView(data, 2)).toThrow(RangeError);
  });

  it('throws RangeError when length is negative', () => {
    const data = fromHexString('00 01 02 03 04 05');

    expect(() => subDataView(data, 2, -1)).toThrow(RangeError);
  });

  it('throws RangeError when length is greater than remaining data', () => {
    const data = fromHexString('00 01 02 03 04 05');

    expect(() => subDataView(data, 2, 5)).toThrow(RangeError);
  });
});
