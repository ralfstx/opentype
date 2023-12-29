/**
 * Array of four unsigned integers used to identify a table,
 * design-variation axis, script, language system, feature, or baseline
 */
export class Tag {
  readonly value: number;

  static fromUint32(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new Error('Tag must be a 32-bit unsigned integer');
    }
    return new Tag(value);
  }

  private constructor(value: number) {
    this.value = value;
  }

  toString() {
    return String.fromCharCode(
      (this.value >> 24) & 0xff,
      (this.value >> 16) & 0xff,
      (this.value >> 8) & 0xff,
      this.value & 0xff
    );
  }
}
