import { describe, it, expect } from 'vitest';
import { INSECT } from './kind';

describe('INSECT kind', () => {
  it('swats aircraft with its tail from the start; its Anti-Air pick unlocks shooting them', () => {
    expect(INSECT.builtInSwat).toBe(true);
    expect(INSECT.abilityText.swat?.desc(1)).toBe('Tail spikes can shoot aircraft');
    expect(INSECT.abilityText.swat?.desc(2)).toBe('Spikes hit aircraft harder and faster');
  });

  it("the Insect's ultimate is Spike Rain", () => {
    expect(INSECT.ultimate).toEqual({ id: 'spikeRain', label: 'Spike Rain' });
  });
});
