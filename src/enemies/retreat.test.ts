import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { escaped, fleePoint } from './retreat';
import { EnemyRegistry } from './EnemyRegistry';
import type { EnemySystem, WorldContext } from './types';

describe('retreat helpers', () => {
  it('fleePoint lies dist m from the monster, through the unit, away from it', () => {
    const p = fleePoint({ x: 100, z: 0 }, { x: 0, z: 0 }, 5000);
    expect(p.x).toBeCloseTo(5000, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('fleePoint goes along +Z from the monster own position', () => {
    expect(fleePoint({ x: 0, z: 0 }, { x: 0, z: 0 }, 5000)).toEqual({ x: 0, z: 5000 });
  });

  it('escaped is true at exactly exitDistance and false 1 m short', () => {
    const d = CONFIG.cycle.exitDistance;
    expect(escaped({ x: d, z: 0 }, { x: 0, z: 0 })).toBe(true);
    expect(escaped({ x: d - 1, z: 0 }, { x: 0, z: 0 })).toBe(false);
  });
});

describe('EnemyRegistry.dismiss', () => {
  it('clears every system but the mech and leaves dust', () => {
    const rings: { kind: string; y: number; r: number }[] = [];
    const cleared: string[] = [];
    const stub = (kind: 'tank' | 'mech', withTarget: boolean): EnemySystem =>
      ({
        kind,
        spawn: () => true,
        update: () => {},
        targets: () => (withTarget ? [{ position: { x: 3, y: 9, z: 4 }, radius: 10, isAlive: () => true }] : []),
        count: () => 0,
        clear: () => cleared.push(kind),
      }) as unknown as EnemySystem;
    const reg = new EnemyRegistry(() => 0.5);
    reg.add(stub('tank', true));
    reg.add(stub('mech', true));
    const ctx = { particles: { ring: (kind: string, at: { y: number }, r: number) => rings.push({ kind, y: at.y, r }) } } as unknown as WorldContext;
    reg.dismiss(ctx);
    expect(cleared).toEqual(['tank']);
    expect(rings).toEqual([{ kind: 'dust', y: 0, r: 20 }]);
  });
});
