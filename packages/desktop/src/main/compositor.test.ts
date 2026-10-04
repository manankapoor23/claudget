import { describe, expect, it } from 'vitest';
import { transparencyFor } from './compositor';

describe('transparencyFor', () => {
  it('leaves macOS and Windows alone', () => {
    expect(transparencyFor('darwin', undefined, null)).toBe('transparent');
    expect(transparencyFor('win32', undefined, false)).toBe('transparent');
  });
  it('trusts Wayland, which always composites', () => {
    expect(transparencyFor('linux', 'wayland', null)).toBe('transparent');
  });
  it('follows the probe on X11 and goes opaque when unsure', () => {
    expect(transparencyFor('linux', 'x11', true)).toBe('transparent');
    expect(transparencyFor('linux', 'x11', false)).toBe('opaque');
    expect(transparencyFor('linux', 'x11', null)).toBe('opaque');
    expect(transparencyFor('linux', undefined, null)).toBe('opaque');
  });
});
