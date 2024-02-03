export class DataWriter {
  readonly data: DataView;
  #position: number;

  constructor(data?: DataView) {
    this.data = data ?? new DataView(new ArrayBuffer(1024));
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

  writeUint8(value: number) {
    this.data.setUint8(this.#position++, value);
    return this;
  }

  writeInt8(value: number) {
    this.data.setInt8(this.#position++, value);
    return this;
  }

  writeUint16(value: number) {
    this.data.setUint16(this.#position, value, false);
    this.#position += 2;
    return this;
  }

  writeInt16(value: number) {
    this.data.setInt16(this.#position, value, false);
    this.#position += 2;
    return this;
  }

  writeUint24(value: number) {
    this.data.setUint8(this.#position++, (value >> 16) & 0xff);
    this.data.setUint8(this.#position++, (value >> 8) & 0xff);
    this.data.setUint8(this.#position++, value & 0xff);
    return this;
  }

  writeUint32(value: number) {
    this.data.setUint32(this.#position, value, false);
    this.#position += 4;
    return this;
  }

  writeInt32(value: number) {
    this.data.setInt32(this.#position, value, false);
    this.#position += 4;
    return this;
  }

  writeFixed(value: number) {
    const major = Math.floor(value);
    const minor = Math.floor((value - major) * 0x10000);
    this.data.setInt16(this.#position, major, false);
    this.data.setUint16(this.#position + 2, minor, false);
    this.#position += 4;
    return this;
  }

  writeBytes(bytes: number[] | Uint8Array) {
    for (let i = 0, length = bytes.length; i < length; i++) {
      this.data.setUint8(this.#position++, bytes[i]);
    }
    return this;
  }

  writeTag(tag: string) {
    if (tag.length < 3 || tag.length > 4) throw new Error('Tag length out of bounds');
    this.data.setInt8(this.#position++, tag.charCodeAt(0));
    this.data.setInt8(this.#position++, tag.charCodeAt(1));
    this.data.setInt8(this.#position++, tag.charCodeAt(2));
    this.data.setInt8(this.#position++, tag.charCodeAt(3) || 0x20); // pad with space
  }

  writeUtf16BE(string: string) {
    for (const char of string) {
      const code = char.charCodeAt(0);
      if (code > 0xffff) throw new Error('Character out of range');
      this.data.setUint16(this.#position, code);
      this.#position += 2;
    }
    return this;
  }

  getData() {
    const buffer = this.data.buffer.slice(
      this.data.byteOffset,
      this.data.byteOffset + this.#position
    );
    return new DataView(buffer);
  }
}
