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

  seek(position: number): DataReader {
    if (position < 0 || position > this.data.byteLength) {
      throw new RangeError('Position is out of bounds');
    }
    this.#position = position;
    return this;
  }

  readUint8(): number {
    this.#checkBounds(1);
    const value = this.data.getUint8(this.#position);
    this.#position += 1;
    return value;
  }

  readInt8(): number {
    this.#checkBounds(1);
    const value = this.data.getInt8(this.#position);
    this.#position += 1;
    return value;
  }

  readUint16(): number {
    this.#checkBounds(2);
    const value = this.data.getUint16(this.#position, false);
    this.#position += 2;
    return value;
  }

  readInt16(): number {
    this.#checkBounds(2);
    const value = this.data.getInt16(this.#position, false);
    this.#position += 2;
    return value;
  }

  readUint24(): number {
    this.#checkBounds(3);
    const value1 = this.data.getUint8(this.#position++);
    const value2 = this.data.getUint8(this.#position++);
    const value3 = this.data.getUint8(this.#position++);
    return (value1 << 16) | (value2 << 8) | value3;
  }

  readUint32(): number {
    this.#checkBounds(4);
    const value = this.data.getUint32(this.#position, false);
    this.#position += 4;
    return value;
  }

  readInt32(): number {
    this.#checkBounds(4);
    const value = this.data.getInt32(this.#position, false);
    this.#position += 4;
    return value;
  }

  readFixed(): number {
    this.#checkBounds(4);
    const major = this.data.getInt16(this.#position, false);
    const minor = this.data.getUint16(this.#position + 2, false) / 0x10000;
    this.#position += 4;
    return parseFloat((major + minor).toFixed(3));
  }

  readBytes(length: number): Uint8Array {
    this.#checkBounds(length);
    const offset = this.data.byteOffset + this.#position;
    const bytes = new Uint8Array(this.data.buffer, offset, length);
    this.#position += length;
    return bytes;
  }

  readAscii(length: number): string {
    this.#checkBounds(length);
    const offset = this.data.byteOffset + this.#position;
    const bytes = new Uint8Array(this.data.buffer, offset, length);
    const string = new TextDecoder('ascii').decode(bytes);
    this.#position += length;
    return string;
  }

  readUtf16BE(length: number): string {
    this.#checkBounds(length);
    const offset = this.data.byteOffset + this.#position;
    const bytes = new Uint8Array(this.data.buffer, offset, length);
    const string = new TextDecoder('utf-16be').decode(bytes);
    this.#position += length;
    return string;
  }

  #checkBounds(length: number) {
    if (this.#position + length > this.data.byteLength) {
      throw new RangeError('Out of bounds access');
    }
  }
}

export function subDataView(data: DataView, offset: number, length?: number): DataView {
  if (offset < 0 || offset > data.byteLength) {
    throw new RangeError('Offset is out of bounds');
  }
  const maxLength = data.byteLength - offset;
  const subLength = length ?? maxLength;
  if (subLength < 0 || subLength > maxLength) {
    throw new RangeError('Length is out of bounds');
  }
  return new DataView(data.buffer, data.byteOffset + offset, length);
}
