import type * as THREE from 'three';

/** Every monster kind's ultimate, by name. */
export type UltimateId = 'devour' | 'inkStorm' | 'plasmaLance';

/**
 * A monster's ultimate (Q) as GameScene runs it: started at the monster, advanced on real seconds, asking for its own
 * world time scale while active. GameScene applies the shared rules (invulnerability, no spawning, level-ups waiting,
 * Q's guards) around it.
 */
export interface Ultimate {
  readonly active: boolean;
  /** World time scale while it runs (1 when idle). */
  timeScale(): number;
  start(center: THREE.Vector3, damageMult: number): void;
  /** Advance by real seconds (0 while paused). Returns true on the frame it ends and control returns. */
  update(realDt: number): boolean;
  /** Stop at once, restoring everything it changed (restart, exit, death, a monster change). */
  cancel(): void;
  dispose(): void;
}
