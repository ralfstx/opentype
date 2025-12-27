export function toHexString(data: DataView): string {
  const hexArray: string[] = [];

  for (let i = 0; i < data.byteLength; i++) {
    hexArray.push(data.getUint8(i).toString(16).padStart(2, '0'));
  }

  return hexArray.join(' ');
}

export function fromHexString(...hexParts: string[]) {
  const hexStr = hexParts.join('').replace(/\s/g, '');
  if (hexStr.length % 2) throw new Error('Odd number of chars in hex string');
  if (!/^[0-9a-fA-F]*$/.test(hexStr)) throw new Error('Invalid char in hex string');
  const bytes: number[] = [];

  for (let i = 0, len = hexStr.length; i < len; i += 2) {
    bytes.push(parseInt(hexStr.slice(i, i + 2), 16));
  }

  return new DataView(new Uint8Array(bytes).buffer);
}
