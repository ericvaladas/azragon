import { dist2, type Vec2 } from '../util/math';

/**
 * `building`: ranged attacks never fire at it; an attack order on one walks up and strikes it in melee.
 * `lowFlyer`: an airborne target within the melee's reach overhead (the Wendigo's claws); ordered, it is approached
 * and struck like a ground target.
 */
export type BrainTarget = { x: number; z: number; radius: number; airborne: boolean; alive: boolean; building?: boolean; lowFlyer?: boolean };
export type BrainOrder = { kind: 'move'; to: Vec2 } | { kind: 'attack'; target: BrainTarget } | null;
export type BrainInput = {
  pos: Vec2;
  order: BrainOrder;
  auto: BrainTarget | null;
  /** Nearest live ground enemy (or low flyer, for claws that reach them) within strike reach, struck automatically when ready. */
  autoMelee: BrainTarget | null;
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
  /** Where a melee strike should land (set whenever attack is 'melee'). */
  meleeAt: Vec2 | null;
  orderDone: boolean;
};

const IDLE: Decision = { moveTo: null, face: null, attack: null, attackOn: null, meleeAt: null, orderDone: false };

/** Unordered attacks: strike a ground enemy in reach if the leg is ready, else spike the nearest enemy. */
function autoAttack(i: BrainInput): Pick<Decision, 'attack' | 'attackOn' | 'meleeAt'> {
  const m = i.autoMelee;
  if (m && m.alive && i.meleeReady) return { attack: 'melee', attackOn: 'auto', meleeAt: { x: m.x, z: m.z } };
  if (i.auto && i.auto.alive && i.spikeReady) return { attack: 'ranged', attackOn: 'auto', meleeAt: null };
  return { attack: null, attackOn: null, meleeAt: null };
}

/** Pure decision for one frame: orders first; otherwise (and while walking) strike or spike automatically. */
export function decide(i: BrainInput): Decision {
  const o = i.order;
  let orderDone = false;

  if (o?.kind === 'move') {
    if (dist2(i.pos, o.to) > i.arriveRadius) {
      // Keep fighting while walking.
      return { ...IDLE, moveTo: o.to, ...autoAttack(i) };
    }
    orderDone = true;
  } else if (o?.kind === 'attack') {
    const t = o.target;
    if (t.alive) {
      const at = { x: t.x, z: t.z };
      const gap = dist2(i.pos, at) - t.radius;
      if (t.airborne && !t.lowFlyer) {
        if (gap <= i.spikeRange) {
          return { ...IDLE, face: at, attack: i.spikeReady ? 'ranged' : null, attackOn: i.spikeReady ? 'order' : null };
        }
        return { ...IDLE, moveTo: at };
      }
      if (gap <= i.meleeRange) {
        return i.meleeReady ? { ...IDLE, face: at, attack: 'melee', attackOn: 'order', meleeAt: at } : { ...IDLE, face: at };
      }
      // Walking up to an ordered building, the ranged attack keeps firing at enemies in range instead.
      if (t.building) {
        const auto = i.auto && i.auto.alive && i.spikeReady;
        return { ...IDLE, moveTo: at, attack: auto ? 'ranged' : null, attackOn: auto ? 'auto' : null };
      }
      const fire = gap <= i.spikeRange && i.spikeReady;
      return { ...IDLE, moveTo: at, attack: fire ? 'ranged' : null, attackOn: fire ? 'order' : null };
    }
    orderDone = true;
  }

  return { ...IDLE, ...autoAttack(i), orderDone };
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
