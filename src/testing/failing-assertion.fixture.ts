import { describe, expect, it } from 'vitest';

describe('gate probe', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
