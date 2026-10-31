import { describe, it, expect } from 'vitest';
import { INSECT } from './kind';

describe('INSECT kind', () => {
  it("the Insect's ultimate is Spike Rain", () => {
    expect(INSECT.ultimate).toEqual({ id: 'spikeRain', label: 'Spike Rain' });
  });
});
