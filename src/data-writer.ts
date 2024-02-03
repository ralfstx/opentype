export class DataWriter {
  #data: DataView;
  #isFixedSize: boolean;
  #bufferSize: number;
  #position: number;

  constructor(data: DataView | number = 64) {
    if (typeof data === 'number') {
      this.#data = new DataView(new ArrayBuffer(data));
      this.#isFixedSize = false;
    } else {
      this.#data = data;
      this.#isFixedSize = true;
    }
    this.#bufferSize = this.#data.buffer.byteLength;
    this.#position = 0;
  }

  get data() {
    return this.#data;
  }

  get position() {
    return this.#position;
  }

  reset(position = 0) {
    // position == byteLength is allowed, this is the position after
    // reading the last byte.
    if (position < 0) throw new Error('Out of bounds access');
    this.#ensureCapacity(position);
    this.#position = position;
    return this;
  }

  writeUint8(value: number) {
    this.#ensureCapacity(this.#position + 1);
    this.#data.setUint8(this.#position++, value);
    return this;
  }

  writeInt8(value: number) {
    this.#ensureCapacity(this.#position + 1);
    this.#data.setInt8(this.#position++, value);
    return this;
  }

  writeUint16(value: number) {
    this.#ensureCapacity(this.#position + 2);
    this.#data.setUint16(this.#position, value, false);
    this.#position += 2;
    return this;
  }

  writeInt16(value: number) {
    this.#ensureCapacity(this.#position + 2);
    this.#data.setInt16(this.#position, value, false);
    this.#position += 2;
    return this;
  }

  writeUint24(value: number) {
    this.#ensureCapacity(this.#position + 3);
    this.#data.setUint8(this.#position++, (value >> 16) & 0xff);
    this.#data.setUint8(this.#position++, (value >> 8) & 0xff);
    this.#data.setUint8(this.#position++, value & 0xff);
    return this;
  }

  writeUint32(value: number) {
    this.#ensureCapacity(this.#position + 4);
    this.#data.setUint32(this.#position, value, false);
    this.#position += 4;
    return this;
  }

  writeInt32(value: number) {
    this.#ensureCapacity(this.#position + 4);
    this.#data.setInt32(this.#position, value, false);
    this.#position += 4;
    return this;
  }

  writeFixed(value: number) {
    this.#ensureCapacity(this.#position + 4);
    const major = Math.floor(value);
    const minor = Math.floor((value - major) * 0x10000);
    this.#data.setInt16(this.#position, major, false);
    this.#data.setUint16(this.#position + 2, minor, false);
    this.#position += 4;
    return this;
  }

  writeBytes(bytes: number[] | Uint8Array) {
    this.#ensureCapacity(this.#position + bytes.length);
    for (let i = 0, length = bytes.length; i < length; i++) {
      this.#data.setUint8(this.#position++, bytes[i]);
    }
    return this;
  }

  writeTag(tag: string) {
    this.#ensureCapacity(this.#position + 4);
    if (tag.length < 3 || tag.length > 4) throw new Error('Tag length out of bounds');
    this.#data.setInt8(this.#position++, tag.charCodeAt(0));
    this.#data.setInt8(this.#position++, tag.charCodeAt(1));
    this.#data.setInt8(this.#position++, tag.charCodeAt(2));
    this.#data.setInt8(this.#position++, tag.charCodeAt(3) || 0x20); // pad with space
  }

  writeUtf16BE(string: string) {
    this.#ensureCapacity(this.#position + string.length * 2);
    for (const char of string) {
      const code = char.charCodeAt(0);
      if (code > 0xffff) throw new Error('Character out of range');
      this.#data.setUint16(this.#position, code);
      this.#position += 2;
    }
    return this;
  }

  getData() {
    const buffer = this.#data.buffer.slice(
      this.#data.byteOffset,
      this.#data.byteOffset + this.#position
    );
    return new DataView(buffer);
  }

  #ensureCapacity(requiredSize: number) {
    if (requiredSize > this.#bufferSize) {
      if (this.#isFixedSize) throw new Error('Out of bounds access');
      this.#bufferSize = Math.max(requiredSize, this.#bufferSize * 2);
      const newBuffer = new ArrayBuffer(this.#bufferSize);
      const newDataView = new DataView(newBuffer);
      new Uint8Array(newBuffer).set(new Uint8Array(this.#data.buffer));
      this.#data = newDataView;
    }
  }
}
