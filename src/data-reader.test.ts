import { DataReader } from 'src/data-reader.ts';
import { describe, expect, test } from 'vitest';

describe('DataReader', () => {
  describe('read', () => {
    test('initial position is zero', () => {
      const reader = new DataReader(data(1, 2, 3));

      expect(reader.position).toBe(0);
    });

    test('reset to zero', () => {
      const reader = new DataReader(data(1, 2, 3));
      reader.readUint16();

      reader.reset();

      expect(reader.position).toBe(0);
    });

    test('reset to given position', () => {
      const reader = new DataReader(data(1, 2, 3));

      reader.reset(2);

      expect(reader.position).toBe(2);
    });

    test('reset checks bounds', () => {
      const reader = new DataReader(data(1, 2, 3));

      expect(() => reader.reset(0)).not.toThrow();
      expect(() => reader.reset(3)).not.toThrow();
      expect(() => reader.reset(-1)).toThrow('Out of bounds access');
      expect(() => reader.reset(4)).toThrow('Out of bounds access');
      expect(reader.position).toBe(3);
    });

    test('readUint8', () => {
      const reader = new DataReader(data(1, 255));

      expect(reader.readUint8()).toBe(1);
      expect(reader.readUint8()).toBe(255);
      expect(reader.position).toBe(2);
    });

    test('readInt8', () => {
      const reader = new DataReader(data(1, 255));

      expect(reader.readInt8()).toBe(1);
      expect(reader.readInt8()).toBe(-1);
      expect(reader.position).toBe(2);
    });

    test('readUint16', () => {
      const reader = new DataReader(data(0, 1, 255, 255));

      expect(reader.readUint16()).toBe(1);
      expect(reader.readUint16()).toBe(65535);
      expect(reader.position).toBe(4);
    });

    test('readInt16', () => {
      const reader = new DataReader(data(0, 1, 255, 255));

      expect(reader.readInt16()).toBe(1);
      expect(reader.readInt16()).toBe(-1);
      expect(reader.position).toBe(4);
    });

    test('readUint32', () => {
      const reader = new DataReader(data(0, 0, 0, 1, 255, 255, 255, 255));

      expect(reader.readUint32()).toBe(1);
      expect(reader.readUint32()).toBe(4294967295);
      expect(reader.position).toBe(8);
    });

    test('readInt32', () => {
      const reader = new DataReader(data(0, 0, 0, 1, 255, 255, 255, 255));

      expect(reader.readInt32()).toBe(1);
      expect(reader.readInt32()).toBe(-1);
      expect(reader.position).toBe(8);
    });

    test('readBytes', () => {
      const reader = new DataReader(data(0, 1, 255));

      expect(reader.readBytes(0)).toEqual([]);
      expect(reader.readBytes(3)).toEqual([0, 1, 255]);
      expect(reader.position).toBe(3);
    });

    test('readUtf16BE', () => {
      const reader = new DataReader(data(0x00, 0x61, 0x2a, 0x09, 0x00, 0x62));

      expect(reader.readUtf16BE(0)).toBe('');
      expect(reader.readUtf16BE(6)).toBe('a⨉b');
      expect(reader.position).toBe(6);
    });

    test('readFixed', () => {
      expect(new DataReader(data(0x00, 0x01, 0x01, 0x47)).readFixed()).toBe(1.005);
      expect(new DataReader(data(0x00, 0x03, 0x04, 0xdd)).readFixed()).toBe(3.019);
      expect(new DataReader(data(0x00, 0x02, 0x5e, 0xb8)).readFixed()).toBe(2.37);
    });

    test('subReader creates reader with correct parameters', () => {
      const buffer = data(0, 1, 2, 3, 4, 5, 6, 7, 8, 9).buffer;
      const reader = new DataReader(new DataView(buffer, 2, 5));

      const subReader = reader.subReader(2, 3);

      expect(subReader.data.byteOffset).toBe(4);
      expect(subReader.data.byteLength).toBe(3);
      expect(subReader.position).toBe(0);
      expect(subReader.readUint8()).toBe(4);
    });

    test('subReader checks parameters', () => {
      const buffer = data(0, 1, 2, 3, 4, 5, 6, 7, 8, 9).buffer;
      const reader = new DataReader(new DataView(buffer, 2, 5));

      expect(() => reader.subReader(0)).not.toThrow();
      expect(() => reader.subReader(1)).not.toThrow();
      expect(() => reader.subReader(0, 5)).not.toThrow();
      expect(() => reader.subReader(1, 4)).not.toThrow();
      expect(() => reader.subReader(-1)).toThrow('offset must be positive');
      expect(() => reader.subReader(5)).toThrow('offset must be within data bounds');
      expect(() => reader.subReader(0, -1)).toThrow('length must be positive');
      expect(() => reader.subReader(0, 6)).toThrow('length must be within data bounds');
      expect(() => reader.subReader(1, 5)).toThrow('length must be within data bounds');
    });
  });
});

function data(...values: number[]) {
  return new DataView(new Uint8Array(values).buffer);
}
