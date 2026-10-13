import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Monster } from './Monster';
import type { MonsterBody, MonsterKind } from '../monsters/types';
import { INSECT } from '../monsters/insect/kind';
import { CONFIG } from '../config';
import { STRIKE_TIMES } from './strike';

function stubBody(): MonsterBody & { frames: number } {
  const root = new THREE.Group();
  return {
    root,
    frames: 0,
    animate() {
      this.frames++;
    },
    rangedOrigin: (out) => out.set(1, 2, 3),
    aimError: () => 0,
    dispose() {},
  };
}

function kind(over: Partial<MonsterKind['stats']> = {}): MonsterKind {
  return { ...INSECT, stats: { ...INSECT.stats, ...over }, createBody: () => stubBody() };
}

describe('Monster', () => {
  it('takes HP, speed, and cooldowns from its kind', () => {
    const m = new Monster(new THREE.Scene(), kind({ maxHp: 777, moveSpeed: 100, meleeCooldown: 2, rangedCooldown: 3 }));
    expect(m.hp).toBe(777);
    expect(m.maxHp).toBe(777);
    m.yaw = 0;
    for (let i = 0; i < 10; i++) m.moveToward({ x: 0, z: 5000 }, 0.1, 1);
    expect(m.position.z).toBeCloseTo(100, 0);
    m.startMelee(1, 0, { x: 0, z: 200 });
    for (let i = 0; i < 19; i++) m.tick(0.1);
    expect(m.meleeReady()).toBe(false);
    m.tick(0.11);
    expect(m.meleeReady()).toBe(true);
    m.consumeRanged(1);
    m.tick(2.9);
    expect(m.rangedReady()).toBe(false);
    m.tick(0.11);
    expect(m.rangedReady()).toBe(true);
  });

  it('fires the melee impact at the kind\'s impact time, at the strike point', () => {
    const m = new Monster(new THREE.Scene(), kind({ meleeTiming: { windup: 0.2, impact: 0.5, end: 0.9 } }));
    const hits: THREE.Vector3[] = [];
    m.onMeleeImpact = (p) => hits.push(p);
    m.startMelee(1, 1, { x: 30, z: 40 });
    m.tick(0.45);
    expect(hits).toHaveLength(0);
    m.tick(0.1);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.x).toBe(30);
    expect(hits[0]!.z).toBe(40);
  });

  it('swaps bodies with setKind: old root leaves the scene, the new one joins, stats reset', () => {
    const scene = new THREE.Scene();
    const m = new Monster(scene, kind({ maxHp: 500 }));
    const oldRoot = m.body.root;
    m.visible = false;
    m.hp = 10;
    m.setKind(kind({ maxHp: 900 }));
    expect(oldRoot.parent).toBeNull();
    expect(m.body.root.parent).toBe(scene);
    expect(m.hp).toBe(900);
    expect(m.visible).toBe(false);
  });

  it('delegates the ranged origin and passes the frame to its body', () => {
    const m = new Monster(new THREE.Scene(), kind());
    expect(m.rangedOrigin(new THREE.Vector3()).toArray()).toEqual([1, 2, 3]);
    m.animate(0.016, 0);
    expect((m.body as ReturnType<typeof stubBody>).frames).toBe(1);
  });
});

describe('INSECT kind', () => {
  it('keeps the Insect Titan\'s milestone-3 numbers', () => {
    const M = CONFIG.monster;
    const s = INSECT.stats;
    expect([s.maxHp, s.moveSpeed, s.turnRate, s.damageMult]).toEqual([M.maxHp, M.moveSpeed, M.turnRate, 1]);
    expect([s.footRadius, s.footDamage, s.bodyRadius, s.strideLength]).toEqual([M.footRadius, M.footDamage, M.bodyRadius, M.strideLength]);
    expect([s.meleeRange, s.meleeRadius, s.meleeDamage, s.meleeCooldown]).toEqual([M.meleeRange, M.meleeRadius, M.meleeDamage, M.meleeCooldown]);
    expect(s.meleeTiming).toEqual({ windup: M.meleeWindup, impact: M.meleeWindup + STRIKE_TIMES.strike, end: M.meleeWindup + STRIKE_TIMES.recover });
    expect([s.rangedRange, s.rangedDamage, s.rangedCooldown]).toEqual([M.spikeRange, M.spikeDamage, M.spikeCooldown]);
    expect(s.headHeight).toBe(CONFIG.passives.swat.headHeight);
    expect([INSECT.melee.kind, INSECT.ranged, INSECT.antiAir]).toEqual(['point', 'spikes', 'tail']);
  });
});
