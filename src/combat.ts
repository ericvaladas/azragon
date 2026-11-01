import type * as THREE from 'three';

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
