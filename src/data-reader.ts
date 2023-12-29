import assert from 'node:assert';

export class DataReader {
  readonly data: DataView;
  #position: number;

  constructor(data: DataView) {
    this.data = data;
    this.#position = 0;
  }

  get position() {
    return this.#position;
  }

  reset(position = 0) {
    // position == byteLength is allowed, this is the position after
    // reading the last byte.
    if (position < 0 || position > this.data.byteLength) {
      throw new Error('Out of bounds access');
    }
    this.#position = position;
    return this;
  }

  readUint8() {
    const value = this.data.getUint8(this.#position);
    this.#position += 1;
    return value;
  }

  readInt8() {
    const value = this.data.getInt8(this.#position);
    this.#position += 1;
    return value;
  }

  readUint16() {
    const value = this.data.getUint16(this.#position, false);
    this.#position += 2;
    return value;
  }

  readInt16() {
    const value = this.data.getInt16(this.#position, false);
    this.#position += 2;
    return value;
  }

  readUint24() {
    const value1 = this.data.getUint8(this.#position);
    const value2 = this.data.getUint8(this.#position);
    const value3 = this.data.getUint8(this.#position);
    this.#position += 3;
    return (value1 << 16) | (value2 << 8) | value3;
  }

  readUint32() {
    const value = this.data.getUint32(this.#position, false);
    this.#position += 4;
    return value;
  }

  readInt32() {
    const value = this.data.getInt32(this.#position, false);
    this.#position += 4;
    return value;
  }

  readFixed() {
    const major = this.data.getInt16(this.#position, false);
    const minor = this.data.getUint16(this.#position + 2, false) / 0x10000;
    this.#position += 4;
    return parseFloat((major + minor).toFixed(3));
  }

  readBytes(length: number) {
    const bytes = Array.from({ length }, (_, i) => this.data.getUint8(this.#position + i));
    this.#position += length;
    return bytes;
  }

  readUtf16BE(length: number) {
    const bytes = Array.from({ length }, (_, i) => this.data.getUint8(this.#position + i));
    const string = new TextDecoder('utf-16be').decode(new Uint8Array(bytes));
    this.#position += length;
    return string;
  }

  subReader(offset: number, length?: number) {
    return new DataReader(subDataView(this.data, offset, length));
  }
}

export function subDataView(data: DataView, offset: number, length?: number) {
  assert.ok(offset >= 0, 'offset must be positive');
  assert.ok(offset < data.byteLength, 'offset must be within data bounds');
  const maxLength = data.byteLength - offset;
  const subLength = length ?? maxLength;
  assert.ok(subLength >= 0, 'length must be positive');
  assert.ok(subLength <= maxLength, 'length must be within data bounds');
  return new DataView(data.buffer, data.byteOffset + offset, length);
}
