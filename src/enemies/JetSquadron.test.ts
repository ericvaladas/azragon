import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { JetSquadron } from './JetSquadron';
import { mulberry32 } from '../util/rng';
import type { WorldContext } from './types';
import type { Target } from '../combat';
import { spawnDirection } from '../systems/runaway';

const DT = 0.05;

function makeCtx() {
  const destroyed: { t: Target; exp: number }[] = [];
  const rockets: number[] = [];
  const ctx = {
    monster: { position: new THREE.Vector3(), alive: true, airborne: false },
    difficulty: { hpMult: 1, dmgMult: 1 },
    level: 3,
    rng: mulberry32(5),
    spawnDir: ((r) => () => spawnDirection(r, null))(mulberry32(101)),
    particles: { ring: () => {}, explosion: () => {}, emit: () => {} },
    roads: { nearest: (p: unknown) => p, nearestLand: (p: unknown) => p, path: () => [] },
    damageMonster: () => {},
    damageBuildings: () => {},
    fireShell: () => {},
    fireRocket: (_f: THREE.Vector3, _t: THREE.Vector3, damage: number) => rockets.push(damage),
    splash: () => {},
    shake: () => {},
    onDestroyed: (t: Target, exp: number) => destroyed.push({ t, exp }),
  } as unknown as WorldContext & { retreating?: boolean };
  return { ctx, rockets, destroyed };
}

const run = (s: JetSquadron, ctx: WorldContext, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += DT) s.update(DT, ctx);
};

describe('JetSquadron retreat', () => {
  it('fires a salvo on its run with retreating unset', () => {
    const { ctx, rockets } = makeCtx();
    const s = new JetSquadron(new THREE.Scene());
    s.spawn(ctx);
    run(s, ctx, 20);
    expect(rockets.length).toBeGreaterThanOrEqual(CONFIG.jet.rocketsPerSalvo);
  });

  it('attacks nothing while retreating', () => {
    const { ctx, rockets } = makeCtx();
    const s = new JetSquadron(new THREE.Scene());
    s.spawn(ctx);
    ctx.retreating = true;
    run(s, ctx, 20);
    expect(rockets).toEqual([]);
  });

  it('flies off and is removed past exitDistance without a kill, never looping back', () => {
    const { ctx, destroyed } = makeCtx();
    const s = new JetSquadron(new THREE.Scene());
    s.spawn(ctx);
    ctx.retreating = true;
    const jet = s.targets()[0]!;
    const dist = () => Math.hypot(jet.position.x, jet.position.z);
    run(s, ctx, 60);
    const mid = dist();
    run(s, ctx, 10);
    expect(s.targets().length === 0 || dist() > mid).toBe(true);
    run(s, ctx, 90);
    expect(s.targets().length).toBe(0);
    expect(destroyed).toEqual([]);
  });

  it('still reports a kill with exp while retreating', () => {
    const { ctx, destroyed } = makeCtx();
    const s = new JetSquadron(new THREE.Scene());
    s.spawn(ctx);
    ctx.retreating = true;
    const t = s.targets()[0]!;
    t.applyDamage(1e9);
    expect(destroyed).toEqual([{ t, exp: CONFIG.jet.exp }]);
  });
});
