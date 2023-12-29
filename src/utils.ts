export function checkIndex(index: number, length: number) {
  if (!Number.isInteger(index)) {
    throw new Error(`Invalid index ${index}`);
  }
  if (index < 0 || index >= length) {
    throw new Error(`Index out of bounds ${index}`);
  }
  return index;
}
