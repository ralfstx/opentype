import { DataReader } from 'src/data-reader.ts';
import { DataWriter } from 'src/data-writer.ts';
import { describe, expect, test } from 'vitest';

describe('DataWriter', () => {
  test('inital position is zero', () => {
    const writer = new DataWriter(data(16));

    expect(writer.position).toBe(0);
  });

  test('reset to zero', () => {
    const writer = new DataWriter(data(16));
    writer.writeUint16(0);

    writer.reset();

    expect(writer.position).toBe(0);
    expect(writer.reset()).toBe(writer);
  });

  test('reset to given position', () => {
    const writer = new DataWriter(data(16));

    writer.reset(2);

    expect(writer.position).toBe(2);
  });

  test('reset checks bounds', () => {
    const writer = new DataWriter(data(16));

    expect(() => writer.reset(0)).not.toThrow();
    expect(() => writer.reset(16)).not.toThrow();
    expect(() => writer.reset(-1)).toThrow('Out of bounds access');
    expect(() => writer.reset(17)).toThrow('Out of bounds access');
    expect(writer.position).toBe(16);
  });

  test('reset grows data buffer', () => {
    const writer = new DataWriter(0);

    writer.reset(23);

    expect(writer.data.byteLength).toBe(23);
  });

  test('writeUint8', () => {
    const writer = new DataWriter();

    writer.writeUint8(1);
    writer.writeUint8(255);

    expect(writer.data.getUint8(0)).toBe(1);
    expect(writer.data.getUint8(1)).toBe(255);
    expect(writer.position).toBe(2);
    expect(writer.writeUint8(0)).toBe(writer);
  });

  test('writeInt8', () => {
    const writer = new DataWriter();

    writer.writeInt8(1);
    writer.writeInt8(-1);

    expect(writer.data.getInt8(0)).toBe(1);
    expect(writer.data.getInt8(1)).toBe(-1);
    expect(writer.position).toBe(2);
    expect(writer.writeInt8(0)).toBe(writer);
  });

  test('writeUint16', () => {
    const writer = new DataWriter();

    writer.writeUint16(1);
    writer.writeUint16(65535);

    expect(writer.data.getUint16(0)).toBe(1);
    expect(writer.data.getUint16(2)).toBe(65535);
    expect(writer.position).toBe(4);
    expect(writer.writeUint16(0)).toBe(writer);
  });

  test('writeInt16', () => {
    const writer = new DataWriter();

    writer.writeInt16(1);
    writer.writeInt16(-1);

    expect(writer.data.getInt16(0)).toBe(1);
    expect(writer.data.getInt16(2)).toBe(-1);
    expect(writer.position).toBe(4);
    expect(writer.writeInt16(0)).toBe(writer);
  });

  test('writeUint32', () => {
    const writer = new DataWriter();

    writer.writeUint32(1);
    writer.writeUint32(4294967295);

    expect(writer.data.getUint32(0)).toBe(1);
    expect(writer.data.getUint32(4)).toBe(4294967295);
    expect(writer.position).toBe(8);
    expect(writer.writeUint32(0)).toBe(writer);
  });

  test('writeInt32', () => {
    const writer = new DataWriter();

    writer.writeInt32(1);
    writer.writeInt32(-1);

    expect(writer.data.getInt32(0)).toBe(1);
    expect(writer.data.getInt32(4)).toBe(-1);
    expect(writer.position).toBe(8);
    expect(writer.writeInt32(0)).toBe(writer);
  });

  test('writeFixed', () => {
    const readBytes = (writer: DataWriter) => new DataReader(writer.getData()).readBytes(4);

    expect(readBytes(new DataWriter().writeFixed(1.005))).toEqual([0x00, 0x01, 0x01, 0x47]);
    expect(readBytes(new DataWriter().writeFixed(3.019))).toEqual([0x00, 0x03, 0x04, 0xdd]);
    expect(readBytes(new DataWriter().writeFixed(2.37))).toEqual([0x00, 0x02, 0x5e, 0xb8]);
  });

  test('writeBytes', () => {
    const writer = new DataWriter();

    writer.writeBytes([]);
    writer.writeBytes([0, 1, 255]);

    expect(writer.data.getUint8(0)).toBe(0);
    expect(writer.data.getUint8(1)).toBe(1);
    expect(writer.data.getUint8(2)).toBe(255);
    expect(writer.position).toBe(3);
    expect(writer.writeBytes([])).toBe(writer);
  });

  test('writeTag', () => {
    const writer = new DataWriter();

    writer.writeTag('hea');

    expect(writer.data.getUint8(0)).toBe(0x68);
    expect(writer.data.getUint8(1)).toBe(0x65);
    expect(writer.data.getUint8(2)).toBe(0x61);
    expect(writer.data.getUint8(3)).toBe(0x20); // padded with space
    expect(writer.position).toBe(4);
  });

  test('writeUtf16BE', () => {
    const writer = new DataWriter();

    writer.writeUtf16BE('a⨉b');

    expect(writer.data.getUint16(0)).toBe(0x0061); // a
    expect(writer.data.getUint16(2)).toBe(0x2a09); // ⨉
    expect(writer.data.getUint16(4)).toBe(0x0062); // b
    expect(writer.position).toBe(6);
  });
});

function data(size: number) {
  return new DataView(new Uint8Array(size).buffer);
}
