import { DataWriter } from 'src/data-writer.ts';
import { toHexString } from 'test/utils.ts';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DataWriter', () => {
  let writer: DataWriter;

  beforeEach(() => {
    writer = new DataWriter();
  });

  it('has an initial position of zero', () => {
    expect(writer.position).toBe(0);
  });

  describe('seek', () => {
    it('resets position to 0', () => {
      writer.writeUint16(0);

      writer.seek(0);

      expect(writer.position).toBe(0);
    });

    it('does not change data size', () => {
      writer.seek(23);

      expect(writer.getData().byteLength).toBe(0);
    });

    it('sets position beyond capacity', () => {
      writer.seek(2);
      writer.writeUint16(0);

      expect(writer.position).toBe(4);
      expect(writer.getData().byteLength).toBe(4);
    });

    it('returns itself', () => {
      expect(writer.seek(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.seek(1.2)).toThrow('Position must be a non-negative integer');
      expect(() => writer.seek(NaN)).toThrow('Position must be a non-negative integer');
      expect(() => writer.seek(Infinity)).toThrow('Position must be a non-negative integer');
    });

    it('throws on negative position', () => {
      expect(() => writer.seek(-1)).toThrow('Position must be a non-negative integer');
    });
  });

  describe('writeUint8', () => {
    it('writes min and max value', () => {
      writer.writeUint8(0);
      writer.writeUint8(255);

      expect(writer.getData().getUint8(0)).toBe(0x00);
      expect(writer.getData().getUint8(1)).toBe(0xff);
      expect(writer.position).toBe(2);
    });

    it('returns itself', () => {
      expect(writer.writeUint8(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeUint8(1.2)).toThrow('Value must be an integer');
      expect(() => writer.writeUint8(NaN)).toThrow('Value must be an integer');
      expect(() => writer.writeUint8(Infinity)).toThrow('Value must be an integer');
    });

    it('throws on out of bounds value', () => {
      expect(() => writer.writeUint8(-1)).toThrow(new TypeError('Value out of range for Uint8'));
      expect(() => writer.writeUint8(256)).toThrow(new TypeError('Value out of range for Uint8'));
    });
  });

  describe('writeInt8', () => {
    it('writes min and max value', () => {
      writer.writeInt8(-128);
      writer.writeInt8(127);

      expect(writer.getData().getInt8(0)).toBe(-0x80);
      expect(writer.getData().getInt8(1)).toBe(0x7f);
      expect(writer.position).toBe(2);
    });

    it('returns itself', () => {
      expect(writer.writeInt8(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeInt8(1.2)).toThrow('Value must be an integer');
      expect(() => writer.writeInt8(NaN)).toThrow('Value must be an integer');
      expect(() => writer.writeInt8(Infinity)).toThrow('Value must be an integer');
    });

    it('throws on out of bounds value', () => {
      expect(() => writer.writeInt8(-0x81)).toThrow(new TypeError('Value out of range for Int8'));
      expect(() => writer.writeInt8(0x80)).toThrow(new TypeError('Value out of range for Int8'));
    });
  });

  describe('writeUint16', () => {
    it('writes min and max value', () => {
      writer.writeUint16(1);
      writer.writeUint16(65535);

      expect(writer.getData().getUint16(0)).toBe(0x0001);
      expect(writer.getData().getUint16(2)).toBe(0xffff);
      expect(writer.position).toBe(4);
    });

    it('returns itself', () => {
      expect(writer.writeUint16(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeUint16(1.2)).toThrow('Value must be an integer');
      expect(() => writer.writeUint16(NaN)).toThrow('Value must be an integer');
      expect(() => writer.writeUint16(Infinity)).toThrow('Value must be an integer');
    });

    it('throws on out of bounds value', () => {
      expect(() => writer.writeUint16(-1)).toThrow(new TypeError('Value out of range for Uint16'));
      expect(() => writer.writeUint16(0x010000)).toThrow(
        new TypeError('Value out of range for Uint16'),
      );
    });
  });

  describe('writeInt16', () => {
    it('writes min and max value', () => {
      writer.writeInt16(-32768);
      writer.writeInt16(32767);

      expect(writer.getData().getInt16(0)).toBe(-0x8000);
      expect(writer.getData().getInt16(2)).toBe(0x7fff);
      expect(writer.position).toBe(4);
    });

    it('returns itself', () => {
      expect(writer.writeInt16(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeInt16(1.2)).toThrow('Value must be an integer');
      expect(() => writer.writeInt16(NaN)).toThrow('Value must be an integer');
      expect(() => writer.writeInt16(Infinity)).toThrow('Value must be an integer');
    });

    it('throws on out of bounds value', () => {
      expect(() => writer.writeInt16(-0x8001)).toThrow(
        new TypeError('Value out of range for Int16'),
      );
      expect(() => writer.writeInt16(0x8000)).toThrow(
        new TypeError('Value out of range for Int16'),
      );
    });
  });

  describe('writeUint24', () => {
    it('writes min and max value', () => {
      writer.writeUint24(0);
      writer.writeUint24(16777215);

      expect(writer.getData().getUint8(0)).toBe(0x00);
      expect(writer.getData().getUint8(1)).toBe(0x00);
      expect(writer.getData().getUint8(2)).toBe(0x00);
      expect(writer.getData().getUint8(3)).toBe(0xff);
      expect(writer.getData().getUint8(4)).toBe(0xff);
      expect(writer.getData().getUint8(5)).toBe(0xff);
      expect(writer.position).toBe(6);
    });

    it('writes value with different bytes', () => {
      writer.writeUint24(66287);

      expect(writer.getData().getUint8(0)).toBe(0x01);
      expect(writer.getData().getUint8(1)).toBe(0x02);
      expect(writer.getData().getUint8(2)).toBe(0xef);
      expect(writer.position).toBe(3);
    });

    it('returns itself', () => {
      expect(writer.writeUint24(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeUint24(1.2)).toThrow('Value must be an integer');
      expect(() => writer.writeUint24(NaN)).toThrow('Value must be an integer');
      expect(() => writer.writeUint24(Infinity)).toThrow('Value must be an integer');
    });

    it('throws on out of bounds value', () => {
      expect(() => writer.writeUint24(-1)).toThrow(new TypeError('Value out of range for Uint24'));
      expect(() => writer.writeUint24(0x01000000)).toThrow(
        new TypeError('Value out of range for Uint24'),
      );
    });
  });

  describe('writeUint32', () => {
    it('writes min and max value', () => {
      writer.writeUint32(0x00000001);
      writer.writeUint32(0xffffffff);

      expect(writer.getData().getUint32(0)).toBe(0x00000001);
      expect(writer.getData().getUint32(4)).toBe(0xffffffff);
      expect(writer.position).toBe(8);
    });

    it('returns itself', () => {
      expect(writer.writeUint32(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeUint32(1.2)).toThrow('Value must be an integer');
      expect(() => writer.writeUint32(NaN)).toThrow('Value must be an integer');
      expect(() => writer.writeUint32(Infinity)).toThrow('Value must be an integer');
    });

    it('throws on out of bounds value', () => {
      expect(() => writer.writeUint32(-1)).toThrow(new TypeError('Value out of range for Uint32'));
      expect(() => writer.writeUint32(0x0100000000)).toThrow(
        new TypeError('Value out of range for Uint32'),
      );
    });
  });

  describe('writeInt32', () => {
    it('writes min and max value', () => {
      writer.writeInt32(-2147483648);
      writer.writeInt32(2147483647);

      expect(writer.getData().getInt32(0)).toBe(-0x80000000);
      expect(writer.getData().getInt32(4)).toBe(0x7fffffff);
      expect(writer.position).toBe(8);
    });

    it('returns itself', () => {
      expect(writer.writeInt32(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeInt32(1.2)).toThrow('Value must be an integer');
      expect(() => writer.writeInt32(NaN)).toThrow('Value must be an integer');
      expect(() => writer.writeInt32(Infinity)).toThrow('Value must be an integer');
    });

    it('throws on out of bounds value', () => {
      expect(() => writer.writeInt32(-0x80000001)).toThrow(
        new TypeError('Value out of range for Int32'),
      );
      expect(() => writer.writeInt32(0x80000000)).toThrow(
        new TypeError('Value out of range for Int32'),
      );
    });
  });

  describe('writeFixed', () => {
    it('writes min and max value', () => {
      writer.writeFixed(1.005);
      writer.writeFixed(3.019);
      writer.writeFixed(2.37);

      expect(writer.getData().getUint32(0)).toBe(0x00010147);
      expect(writer.getData().getUint32(4)).toBe(0x000304dd);
      expect(writer.getData().getUint32(8)).toBe(0x00025eb8);
      expect(writer.position).toBe(12);
    });

    it('returns itself', () => {
      expect(writer.writeFixed(0)).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeFixed(NaN)).toThrow('Value must be a finite number');
      expect(() => writer.writeFixed(Infinity)).toThrow('Value must be a finite number');
    });

    it('throws on out of bounds value', () => {
      expect(() => writer.writeFixed(-0x8001)).toThrow(
        new TypeError('Value out of range for Fixed'),
      );
      expect(() => writer.writeFixed(0x8000)).toThrow(
        new TypeError('Value out of range for Fixed'),
      );
    });
  });

  describe('writeBytes', () => {
    it('writes an empty array', () => {
      writer.writeBytes([]);

      expect(writer.position).toBe(0);
      expect(writer.getData().byteLength).toBe(0);
    });

    it('writes a non-empty array', () => {
      writer.writeBytes([0, 1, 255]);

      expect(writer.getData().getUint8(0)).toBe(0);
      expect(writer.getData().getUint8(1)).toBe(1);
      expect(writer.getData().getUint8(2)).toBe(255);
      expect(writer.position).toBe(3);
      expect(writer.getData().byteLength).toBe(3);
    });

    it('writes a non-empty Uint8Array', () => {
      writer.writeBytes(new Uint8Array([0, 1, 255]));

      expect(writer.position).toBe(3);
      expect(writer.getData().byteLength).toBe(3);
    });

    it('returns itself', () => {
      expect(writer.writeBytes([])).toBe(writer);
    });

    it('throws on valid numbers', () => {
      expect(() => writer.writeBytes([1.2])).toThrow('Bytes array contains non-integer numbers');
      expect(() => writer.writeBytes([NaN])).toThrow('Bytes array contains non-integer numbers');
      expect(() => writer.writeBytes([Infinity])).toThrow(
        'Bytes array contains non-integer numbers',
      );
    });

    it('throws on out of bounds byte value', () => {
      expect(() => writer.writeBytes([-1])).toThrow(
        new TypeError('Bytes array contains out of range numbers'),
      );
      expect(() => writer.writeBytes([256])).toThrow(
        new TypeError('Bytes array contains out of range numbers'),
      );
    });
  });

  describe('writeData', () => {
    it('writes an empty DataView', () => {
      writer.writeData(new DataView(new ArrayBuffer(0)));

      expect(writer.position).toBe(0);
      expect(writer.getData().byteLength).toBe(0);
    });

    it('writes a non-empty DataView', () => {
      writer.writeData(new DataView(new Uint8Array([0, 1, 255]).buffer));

      expect(writer.getData().getUint8(0)).toBe(0);
      expect(writer.getData().getUint8(1)).toBe(1);
      expect(writer.getData().getUint8(2)).toBe(255);
      expect(writer.position).toBe(3);
    });

    it('returns itself', () => {
      expect(writer.writeData(new DataView(new ArrayBuffer(0)))).toBe(writer);
    });
  });

  describe('writeAscii', () => {
    it('accepts an empty string', () => {
      writer.writeAscii('');

      expect(writer.position).toBe(0);
    });

    it('writes a non-empty string', () => {
      writer.writeAscii('\u0020o\u007f');

      expect(writer.getData().getUint8(0)).toBe(0x20);
      expect(writer.getData().getUint8(1)).toBe(0x6f);
      expect(writer.getData().getUint8(2)).toBe(0x7f);
      expect(writer.position).toBe(3);
    });

    it('returns itself', () => {
      expect(writer.writeAscii('foo')).toBe(writer);
    });

    it('throws on non-printable characters', () => {
      expect(() => writer.writeAscii('\u0009')).toThrow('String contains non-ASCII character');
      expect(() => writer.writeAscii('\n')).toThrow('String contains non-ASCII character');
      expect(() => writer.writeAscii('\u0080')).toThrow('String contains non-ASCII character');
    });

    it('throws on a tag with non-ASCII characters', () => {
      expect(() => writer.writeAscii('fóo')).toThrow('String contains non-ASCII character');
    });
  });

  describe('writeUtf16BE', () => {
    it('writes a single character', () => {
      writer.writeUtf16BE('a');

      expect(writer.getData().getUint16(0)).toBe(0x0061); // a
      expect(writer.position).toBe(2);
    });

    it('writes a string with multiple characters', () => {
      writer.writeUtf16BE('a⨉𝄞');

      expect(toHexString(writer.getData())).toBe(
        [
          '00 61', // U+0061 (LETTER A)
          '2a 09', // U+2A09 (MATHEMATICAL TIMES)
          'd8 34 dd 1e', // U+1D11E (MUSICAL SYMBOL G CLEF)
        ].join(' '),
      );
      expect(writer.position).toBe(8);
    });

    it('returns itself', () => {
      expect(writer.writeUtf16BE('foo')).toBe(writer);
    });
  });
});
