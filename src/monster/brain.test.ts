import { describe, it, expect } from 'vitest';
import { decide, nearestInRange, type BrainInput, type BrainTarget } from './brain';

const base: BrainInput = {
  pos: { x: 0, z: 0 },
  order: null,
  auto: null,
  meleeRange: 300,
  spikeRange: 1700,
  meleeReady: true,
  spikeReady: true,
  arriveRadius: 25,
};
const ground = (x: number, alive = true): BrainTarget => ({ x, z: 0, radius: 30, airborne: false, alive });
const air = (x: number): BrainTarget => ({ x, z: 0, radius: 70, airborne: true, alive: true });

describe('decide', () => {
  it('walks toward a far move order without attacking', () => {
    const d = decide({ ...base, order: { kind: 'move', to: { x: 500, z: 0 } } });
    expect(d.moveTo).toEqual({ x: 500, z: 0 });
    expect(d.attack).toBeNull();
    expect(d.orderDone).toBe(false);
  });
  it('completes a move order on arrival', () => {
    const d = decide({ ...base, order: { kind: 'move', to: { x: 10, z: 0 } } });
    expect(d.orderDone).toBe(true);
    expect(d.moveTo).toBeNull();
  });
  it('stomps a ground target inside melee range, facing it', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: ground(250) } });
    expect(d.attack).toBe('melee');
    expect(d.moveTo).toBeNull();
    expect(d.face).toEqual({ x: 250, z: 0 });
  });
  it('approaches a ground target beyond melee range and spikes it on the way', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: ground(900) } });
    expect(d.moveTo).toEqual({ x: 900, z: 0 });
    expect(d.attack).toBe('ranged');
    expect(d.attackOn).toBe('order');
  });
  it('spikes airborne targets in range without moving', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: air(1200) } });
    expect(d.attack).toBe('ranged');
    expect(d.moveTo).toBeNull();
  });
  it('chases airborne targets out of range', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: air(3000) } });
    expect(d.moveTo).toEqual({ x: 3000, z: 0 });
    expect(d.attack).toBeNull();
  });
  it('drops a dead target and falls back to auto-defense', () => {
    const d = decide({ ...base, order: { kind: 'attack', target: ground(250, false) }, auto: air(800) });
    expect(d.orderDone).toBe(true);
    expect(d.attack).toBe('ranged');
    expect(d.attackOn).toBe('auto');
  });
  it('does not attack while on cooldown', () => {
    const d = decide({ ...base, meleeReady: false, spikeReady: false, order: { kind: 'attack', target: ground(250) } });
    expect(d.attack).toBeNull();
  });
  it('does not auto-fire while executing a move order', () => {
    const d = decide({ ...base, order: { kind: 'move', to: { x: 500, z: 0 } }, auto: air(800) });
    expect(d.attack).toBeNull();
  });
});

describe('nearestInRange', () => {
  const mk = (x: number, alive = true) => ({ position: { x, z: 0 }, isAlive: () => alive });
  it('returns the nearest alive candidate within range', () => {
    const a = mk(500);
    const b = mk(300);
    const c = mk(100, false);
    expect(nearestInRange({ x: 0, z: 0 }, [a, b, c], 1000)).toBe(b);
    expect(nearestInRange({ x: 0, z: 0 }, [a], 400)).toBeNull();
  });
});
