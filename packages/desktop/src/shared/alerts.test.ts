import { describe, expect, it } from 'vitest';
import { thresholdToAnnounce } from './alerts';

describe('thresholdToAnnounce', () => {
  it('announces the highest threshold crossed, once', () => {
    expect(thresholdToAnnounce(0.82, [80, 95], 0)).toBe(80);
    expect(thresholdToAnnounce(0.82, [80, 95], 80)).toBeNull();
    expect(thresholdToAnnounce(0.96, [80, 95], 80)).toBe(95);
  });
  it('jumps straight to the top threshold when opened late', () => {
    expect(thresholdToAnnounce(0.99, [80, 95], 0)).toBe(95);
  });
  it('is silent below every threshold and tolerates unsorted, duplicate input', () => {
    expect(thresholdToAnnounce(0.5, [95, 80, 80], 0)).toBeNull();
    expect(thresholdToAnnounce(0.9, [95, 80, 80], 0)).toBe(80);
  });
});
