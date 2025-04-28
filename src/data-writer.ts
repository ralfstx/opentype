import { subDataView } from './data-reader.ts';

/**
 * DataWriter is a utility class for writing binary data to a
 * dynamically growing ArrayBuffer.
 */
export class DataWriter {
  #data: DataView;
  #bufferSize: number;
  #position: number;
  #maxPosition: number;

  constructor(initialSize = 64) {
    this.#data = new DataView(new ArrayBuffer(initialSize));
    this.#bufferSize = this.#data.buffer.byteLength;
    this.#position = 0;
    this.#maxPosition = 0;
  }

  /**
   * The current writing position in the buffer.
   * This is the next position where data will be written.
   */
  get position() {
    return this.#position;
  }

  /**
   * The length of the written data in bytes.
   * This is the maximum position reached during writing.
   */
  get byteLength() {
    return this.#maxPosition;
  }

  /**
   * Returns a DataView of the written data.
   */
  getData(): DataView {
    return subDataView(this.#data, 0, this.#maxPosition);
  }

  /**
   * Moves the writing position to the specified position.
   * If the position is greater than the current buffer size,
   * the buffer will be expanded to accommodate the new position.
   */
  seek(position: number): DataWriter {
    if (!Number.isInteger(position) || position < 0) {
      throw new Error('Position must be a non-negative integer');
    }
    this.#ensureCapacity(position);
    this.#position = position;
    // Do not update maxPosition here, since we did not write at this position yet.
    return this;
  }

  writeUint8(value: number): DataWriter {
    if (!Number.isInteger(value)) throw new TypeError('Value must be an integer');
    if (value < 0 || value > 0xff) throw new TypeError('Value out of range for Uint8');
    this.#ensureCapacity(this.#position + 1);
    this.#data.setUint8(this.#position++, value);
    this.#updateMaxPosition();
    return this;
  }

  writeInt8(value: number): DataWriter {
    if (!Number.isInteger(value)) throw new TypeError('Value must be an integer');
    if (value < -0x80 || value > 0x7f) throw new TypeError('Value out of range for Int8');
    this.#ensureCapacity(this.#position + 1);
    this.#data.setInt8(this.#position++, value);
    this.#updateMaxPosition();
    return this;
  }

  writeUint16(value: number): DataWriter {
    if (!Number.isInteger(value)) throw new TypeError('Value must be an integer');
    if (value < 0 || value > 0xffff) throw new TypeError('Value out of range for Uint16');
    this.#ensureCapacity(this.#position + 2);
    this.#data.setUint16(this.#position, value, false);
    this.#position += 2;
    this.#updateMaxPosition();
    return this;
  }

  writeInt16(value: number): DataWriter {
    if (!Number.isInteger(value)) throw new TypeError('Value must be an integer');
    if (value < -0x8000 || value > 0x7fff) throw new TypeError('Value out of range for Int16');
    this.#ensureCapacity(this.#position + 2);
    this.#data.setInt16(this.#position, value, false);
    this.#position += 2;
    this.#updateMaxPosition();
    return this;
  }

  writeUint24(value: number): DataWriter {
    if (!Number.isInteger(value)) throw new TypeError('Value must be an integer');
    if (value < 0 || value > 0xffffff) throw new TypeError('Value out of range for Uint24');
    this.#ensureCapacity(this.#position + 3);
    this.#data.setUint8(this.#position++, (value >> 16) & 0xff);
    this.#data.setUint8(this.#position++, (value >> 8) & 0xff);
    this.#data.setUint8(this.#position++, value & 0xff);
    this.#updateMaxPosition();
    return this;
  }

  writeUint32(value: number): DataWriter {
    if (!Number.isInteger(value)) throw new TypeError('Value must be an integer');
    if (value < 0 || value > 0xffffffff) throw new TypeError('Value out of range for Uint32');
    this.#ensureCapacity(this.#position + 4);
    this.#data.setUint32(this.#position, value, false);
    this.#position += 4;
    this.#updateMaxPosition();
    return this;
  }

  writeInt32(value: number): DataWriter {
    if (!Number.isInteger(value)) throw new TypeError('Value must be an integer');
    if (value < -0x80000000 || value > 0x7fffffff) {
      throw new TypeError('Value out of range for Int32');
    }
    this.#ensureCapacity(this.#position + 4);
    this.#data.setInt32(this.#position, value, false);
    this.#position += 4;
    this.#updateMaxPosition();
    return this;
  }

  writeFixed(value: number): DataWriter {
    if (!Number.isFinite(value)) throw new TypeError('Value must be a finite number');
    const major = Math.floor(value);
    const minor = Math.floor((value - major) * 0x10000);

    if (!(major >= -0x8000 && major <= 0x7fff)) {
      throw new TypeError('Value out of range for Fixed');
    }
    if (!(minor >= 0 && minor <= 0xffff)) {
      throw new TypeError('Value out of range for Fixed');
    }

    this.#ensureCapacity(this.#position + 4);
    this.#data.setInt16(this.#position, major, false);
    this.#data.setUint16(this.#position + 2, minor, false);
    this.#position += 4;
    this.#updateMaxPosition();
    return this;
  }

  writeBytes(bytes: number[] | Uint8Array): DataWriter {
    for (let i = 0, length = bytes.length; i < length; i++) {
      const byte = bytes[i];
      if (!Number.isInteger(byte)) {
        throw new TypeError('Bytes array contains non-integer numbers');
      }
      if (byte < 0 || byte > 0xff) {
        throw new TypeError('Bytes array contains out of range numbers');
      }
    }
    this.#ensureCapacity(this.#position + bytes.length);
    new Uint8Array(this.#data.buffer, this.#position, bytes.length).set(bytes);
    this.#position += bytes.length;
    this.#updateMaxPosition();
    return this;
  }

  writeData(data: DataView): DataWriter {
    this.#ensureCapacity(this.#position + data.byteLength);
    const srcBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    new Uint8Array(this.#data.buffer, this.#position, data.byteLength).set(srcBytes);
    this.#position += data.byteLength;
    this.#updateMaxPosition();
    return this;
  }

  writeAscii(str: string): DataWriter {
    this.#ensureCapacity(this.#position + str.length);
    for (const ch of str) {
      const charCode = ch.charCodeAt(0);
      if (charCode < 0x20 || charCode > 0x7f) {
        throw new Error('String contains non-ASCII character');
      }
      this.#data.setUint8(this.#position++, charCode);
    }
    this.#updateMaxPosition();
    return this;
  }

  writeUtf16BE(str: string): DataWriter {
    const bytes: number[] = [];

    for (const char of str) {
      const code = char.codePointAt(0)!;

      if (code <= 0xffff) {
        // BMP character
        bytes.push(code >> 8, code & 0xff);
      } else {
        // Surrogate pair
        const surrogate = code - 0x10000;
        const highSurrogate = 0xd800 + (surrogate >> 10);
        const lowSurrogate = 0xdc00 + (surrogate & 0x3ff);
        bytes.push(highSurrogate >> 8, highSurrogate & 0xff);
        bytes.push(lowSurrogate >> 8, lowSurrogate & 0xff);
      }
    }

    this.#ensureCapacity(this.#position + bytes.length);
    new Uint8Array(this.#data.buffer, this.#position, bytes.length).set(bytes);
    this.#position += bytes.length;
    this.#updateMaxPosition();
    return this;
  }

  #ensureCapacity(requiredSize: number) {
    if (requiredSize > this.#bufferSize) {
      this.#bufferSize = Math.max(requiredSize, this.#bufferSize * 2);
      const newBuffer = new ArrayBuffer(this.#bufferSize);
      const newDataView = new DataView(newBuffer);
      new Uint8Array(newBuffer).set(new Uint8Array(this.#data.buffer));
      this.#data = newDataView;
    }
  }

  #updateMaxPosition() {
    this.#maxPosition = Math.max(this.#maxPosition, this.#position);
  }
}
