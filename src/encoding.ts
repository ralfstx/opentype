export function getEncoding(platformID: number, encodingID: number): string | undefined {
  if (platformID === 0) {
    // Unicode
    return 'utf-16be';
  }
  if (platformID === 1) {
    // Macintosh
    if (encodingID === 0) {
      // Mac Roman
      return 'macintosh';
    }
  }
  if (platformID === 3) {
    // Windows
    if (encodingID === 1) {
      // Unicode BMP
      return 'utf-16be';
    }
    if (encodingID === 2) {
      // ShiftJIS
      return 'shift-jis';
    }
    if (encodingID === 3) {
      // PRC
      return 'gb18030';
    }
    if (encodingID === 4) {
      // Big5
      return 'big5';
    }
    if (encodingID === 10) {
      // Unicode full repertoire
      return 'utf-16be';
    }
  }
}
