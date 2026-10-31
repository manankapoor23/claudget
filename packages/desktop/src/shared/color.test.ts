import { describe, expect, it } from 'vitest';
import { hexToHs, hsToHex } from './color';

describe('colour wheel maths', () => {
  it('puts the primaries where the wheel draws them', () => {
    expect(hsToHex(0, 1)).toBe('#ff0000');
    expect(hsToHex(60, 1)).toBe('#ffff00');
    expect(hsToHex(120, 1)).toBe('#00ff00');
    expect(hsToHex(240, 1)).toBe('#0000ff');
    expect(hsToHex(123, 0)).toBe('#ffffff');
  });

  it('reads a colour back to the same hue and saturation', () => {
    for (const hex of ['#ff6b1f', '#ffb224', '#ff453a', '#30ffa0']) {
      const { h, s } = hexToHs(hex);
      expect(hsToHex(h, s)).toBe(hex);
    }
    expect(hexToHs('#ffffff')).toEqual({ h: 0, s: 0 });
  });
});
