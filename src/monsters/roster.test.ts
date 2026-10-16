import { describe, it, expect } from 'vitest';
import { KINDS, ROSTER_ORDER, isMonsterId, rosterEntries } from './roster';

describe('roster', () => {
  it('lists four playable monsters in carousel order', () => {
    const e = rosterEntries();
    expect(e.map((x) => x.id)).toEqual(['insect', 'kaiju', 'kraken', 'wendigo']);
    expect(e.map((x) => x.available)).toEqual([true, true, true, true]);
    expect(e[0]!.name).toBe('Insect Titan');
    expect(e[3]!.name).toBe('Wendigo');
    expect(e[0]!.pips).toEqual(KINDS.insect.pips);
    expect(e[2]!.pips).toEqual(KINDS.kraken.pips);
    expect(e[3]!.pips).toEqual(KINDS.wendigo.pips);
    expect(ROSTER_ORDER).toHaveLength(4);
  });
  it('recognises only playable monster ids', () => {
    expect(isMonsterId('insect')).toBe(true);
    expect(isMonsterId('kaiju')).toBe(true);
    expect(isMonsterId('kraken')).toBe(true);
    expect(isMonsterId('wendigo')).toBe(true);
    expect(isMonsterId('toString')).toBe(false);
    expect(isMonsterId('')).toBe(false);
  });
});

describe('spike trails', () => {
  it('only the Insect fires its spikes without a trail', () => {
    for (const [id, kind] of Object.entries(KINDS)) expect(kind.fx.spikeTrail ?? true).toBe(id !== 'insect');
  });
});
