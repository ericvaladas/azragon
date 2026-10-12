import { dist2, type Vec2 } from '../util/math';

export type BrainTarget = { x: number; z: number; radius: number; airborne: boolean; alive: boolean };
export type BrainOrder = { kind: 'move'; to: Vec2 } | { kind: 'attack'; target: BrainTarget } | null;
export type BrainInput = {
  pos: Vec2;
  order: BrainOrder;
  auto: BrainTarget | null;
  meleeRange: number;
  spikeRange: number;
  meleeReady: boolean;
  spikeReady: boolean;
  arriveRadius: number;
};
export type Decision = {
  moveTo: Vec2 | null;
  face: Vec2 | null;
  attack: 'melee' | 'ranged' | null;
  attackOn: 'order' | 'auto' | null;
  orderDone: boolean;
};

const IDLE: Decision = { moveTo: null, face: null, attack: null, attackOn: null, orderDone: false };

/** Pure decision for one frame: orders first; with no live order, auto-defend with spikes. */
export function decide(i: BrainInput): Decision {
  const o = i.order;
  let orderDone = false;

  if (o?.kind === 'move') {
    if (dist2(i.pos, o.to) > i.arriveRadius) return { ...IDLE, moveTo: o.to };
    orderDone = true;
  } else if (o?.kind === 'attack') {
    const t = o.target;
    if (t.alive) {
      const at = { x: t.x, z: t.z };
      const gap = dist2(i.pos, at) - t.radius;
      if (t.airborne) {
        if (gap <= i.spikeRange) {
          return { ...IDLE, face: at, attack: i.spikeReady ? 'ranged' : null, attackOn: i.spikeReady ? 'order' : null };
        }
        return { ...IDLE, moveTo: at };
      }
      if (gap <= i.meleeRange) {
        return { ...IDLE, face: at, attack: i.meleeReady ? 'melee' : null, attackOn: i.meleeReady ? 'order' : null };
      }
      const fire = gap <= i.spikeRange && i.spikeReady;
      return { ...IDLE, moveTo: at, attack: fire ? 'ranged' : null, attackOn: fire ? 'order' : null };
    }
    orderDone = true;
  }

  if (i.auto && i.auto.alive && i.spikeReady) {
    return { ...IDLE, attack: 'ranged', attackOn: 'auto', orderDone };
  }
  return { ...IDLE, orderDone };
}

export function nearestInRange<T extends { position: { x: number; z: number }; isAlive(): boolean }>(
  pos: Vec2,
  candidates: readonly T[],
  range: number,
): T | null {
  let best: T | null = null;
  let bestD = range;
  for (const c of candidates) {
    if (!c.isAlive()) continue;
    const d = dist2(pos, c.position);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
