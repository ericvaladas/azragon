import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TentacleArms } from './TentacleArms';

const T = { windup: 0.3, impact: 0.45, end: 0.85 };
const target = (x: number, z: number) => {
  let alive = true;
  return { position: new THREE.Vector3(x, 0, z), isAlive: () => alive, kill: () => (alive = false) } as unknown as import('../../combat').Target & { kill(): void };
};

describe('TentacleArms', () => {
  it('only free, idle, rested arms can strike', () => {
    const a = new TentacleArms();
    expect(a.freeArms()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    a.roles[3] = 'pull';
    a.roles[4] = 'reach';
    expect(a.isFree(3)).toBe(false);
    expect(a.isFree(4)).toBe(false);
    a.start(3, 'slam', new THREE.Vector3(), null, 1, T);
    expect(a.strikes[3]).toBeNull();
    a.start(0, 'slam', new THREE.Vector3(), null, 1, T);
    expect(a.isFree(0)).toBe(false);
    expect(a.freeArms()).toEqual([1, 2, 5, 6, 7]);
  });

  it('lands each strike once at its impact time on the live target, then rests through its cooldown', () => {
    const a = new TentacleArms();
    const tank = target(100, 0);
    const hits: { arm: number; x: number }[] = [];
    a.start(2, 'slam', tank.position, tank, 1.2, T);
    expect(a.striking().has(tank)).toBe(true);
    tank.position.set(150, 0, 0);
    a.update(0.4, 0.8, (arm, s) => hits.push({ arm, x: s.target.x }));
    expect(hits).toHaveLength(0);
    a.update(0.1, 0.8, (arm, s) => hits.push({ arm, x: s.target.x }));
    expect(hits).toEqual([{ arm: 2, x: 150 }]);
    a.update(0.4, 0.8, () => hits.push({ arm: -1, x: 0 }));
    expect(hits).toHaveLength(1);
    expect(a.strikes[2]).toBeNull();
    expect(a.isFree(2)).toBe(false); // 0.9 s elapsed of a 1.2 s cooldown
    a.update(0.31, 0.8, () => {});
    expect(a.isFree(2)).toBe(true);
  });

  it('finishes against the last known position if the target dies mid-swing', () => {
    const a = new TentacleArms();
    const tank = target(100, 50);
    let at: THREE.Vector3 | null = null;
    a.start(1, 'hurl', tank.position, tank, 0, T);
    a.update(0.1, 0.8, () => {});
    tank.kill();
    tank.position.set(999, 0, 999);
    a.update(0.4, 0.8, (_arm, s) => (at = s.target.clone()));
    expect(at!.x).toBe(100);
    expect(at!.z).toBe(50);
  });

  it('Whirlpool spin occupies every arm for its duration; clear() resets everything', () => {
    const a = new TentacleArms();
    a.spin();
    expect(a.freeArms()).toEqual([]);
    a.update(0.5, 0.8, () => {});
    expect(a.spinT).toBeCloseTo(0.5);
    a.update(0.4, 0.8, () => {});
    expect(a.spinT).toBe(-1);
    a.start(0, 'slam', new THREE.Vector3(), null, 5, T);
    a.roles[5] = 'pull';
    a.spin();
    a.clear();
    expect(a.freeArms()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(a.strikes.every((s) => s === null)).toBe(true);
  });
});
