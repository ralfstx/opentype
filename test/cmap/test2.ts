import { describe } from 'node:test';

import { test } from 'vitest';

export function test2(name: string) {
  describe(name, () => {
    test(name + 1, () => {});
  });
}
