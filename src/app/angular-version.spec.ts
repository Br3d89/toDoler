import { VERSION } from '@angular/core';

describe('Angular version', () => {
  it('runs on Angular 22 or later', () => {
    expect(Number(VERSION.major)).toBeGreaterThanOrEqual(22);
  });
});
