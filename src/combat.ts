import type * as THREE from 'three';

export type TargetKind = 'tank' | 'jet' | 'building';

/** Anything the monster can attack. Owners apply damage and report destruction via OnDestroyed. */
export interface Target {
  readonly kind: TargetKind;
  /** World-space aim point (centre of mass). Updated by the owner each frame. */
  readonly position: THREE.Vector3;
  /** Horizontal radius used for range checks. */
  readonly radius: number;
  readonly airborne: boolean;
  isAlive(): boolean;
  applyDamage(amount: number): void;
}

export type OnDestroyed = (target: Target, exp: number) => void;
