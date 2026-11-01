import type * as THREE from 'three';
import { CONFIG } from './config';

export type TargetKind = 'tank' | 'jet' | 'blimp' | 'sam' | 'missile' | 'artillery' | 'truck' | 'heli' | 'napalm' | 'osprey' | 'gustav' | 'mech' | 'building';

/** Anything the monster can attack. Owners apply damage and report destruction via OnDestroyed. */
export interface Target {
  readonly kind: TargetKind;
  /** World-space aim point (centre of mass). Updated by the owner each frame. */
  readonly position: THREE.Vector3;
  /** Horizontal radius used for range checks. */
  readonly radius: number;
  readonly airborne: boolean;
  /** A boss: ultimates hurt it instead of taking it outright. */
  readonly boss?: boolean;
  isAlive(): boolean;
  applyDamage(amount: number): void;
}

export type OnDestroyed = (target: Target, exp: number) => void;

export type DamageSource = 'shell' | 'rocket' | 'missile' | 'blimp' | 'artillery' | 'laser' | 'beam' | 'napalm' | 'melee';

const AREA: ReadonlySet<DamageSource> = new Set(['laser', 'artillery', 'napalm']);
const DEFLECTABLE: ReadonlySet<DamageSource> = new Set(['shell', 'rocket', 'missile', 'blimp']);

/**
 * Damage the monster actually takes from one hit. Area attacks (laser, artillery, napalm fire) miss while airborne (mid-Leap);
 * nothing lands while invulnerable (Shield Bubble); projectiles and blimp blasts can be deflected (Chitin Deflection) when `roll` < deflectChance.
 */
export function resolveHit(
  amount: number,
  source: DamageSource,
  c: { dmgMult: number; deflectChance: number; airborne: boolean; invulnerable?: boolean },
  roll: number,
): { damage: number; deflected: boolean } {
  if (c.invulnerable) return { damage: 0, deflected: false };
  if (c.airborne && AREA.has(source)) return { damage: 0, deflected: false };
  if (DEFLECTABLE.has(source) && roll < c.deflectChance) return { damage: 0, deflected: true };
  return { damage: amount * c.dmgMult, deflected: false };
}

/** Whether destroying a target of `kind` pays EXP: everything does, except a building brought down by razing. */
export function paysExp(kind: string, razing: boolean): boolean {
  return !(razing && kind === 'building');
}

/** Camera trauma from a building collapsing `dist` m from the monster: full up close, none far off, less if the boss razed it. */
export function collapseTrauma(dist: number, razed: boolean): number {
  const C = CONFIG.camera;
  const near = 1 - Math.min(1, Math.max(0, (dist - C.collapseNear) / (C.collapseFar - C.collapseNear)));
  return C.collapseShake * near * (razed ? C.razedShake : 1);
}
