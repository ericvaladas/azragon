import { CONFIG } from '../config';
import { angleDelta, type Vec2 } from '../util/math';

export type MechAction = 'walk' | 'punch' | 'slam' | 'dash' | 'rockets' | 'barrage';
export type MechMove = Exclude<MechAction, 'walk'>;

/**
 * What the mech's brain sees: its distance to the monster (centre to centre), the contact distance (its radius plus the
 * monster's body radius, where the surfaces touch), whether it has engaged (been within dashTrigger of it, or
 * spent engageAfter s since its summoning), the time left on each cooldown, and a uniform roll in [0, 1) that picks a slam over a punch.
 */
export type MechMind = { dist: number; contact: number; engaged: boolean; meleeCd: number; dashCd: number; rocketCd: number; barrageCd: number; roll: number };

/**
 * The next move, by priority: a dash when engaged, far and ready; a slam (roll < slamChance) or punch when within
 * punchReach past contact and melee is ready; a barrage when ready; rockets when ready and in range; otherwise walk.
 */
export function chooseAction(m: MechMind): MechAction {
  const M = CONFIG.mech;
  if (m.engaged && m.dist > M.dashTrigger && m.dashCd <= 0) return 'dash';
  if (m.dist <= m.contact + M.punchReach && m.meleeCd <= 0) return m.roll < M.slamChance ? 'slam' : 'punch';
  if (m.barrageCd <= 0) return 'barrage';
  if (m.rocketCd <= 0 && m.dist <= M.rocketRange) return 'rockets';
  return 'walk';
}

/** The phase of `action` `t` s after it began, from CONFIG.mech.moves. */
export function movePhase(action: MechMove, t: number): 'windup' | 'strike' | 'recover' | 'done' {
  const d = CONFIG.mech.moves[action];
  if (t < d.windup) return 'windup';
  if (t < d.windup + d.strike) return 'strike';
  if (t < d.windup + d.strike + d.recover) return 'recover';
  return 'done';
}

/**
 * A punch from `mech` facing `yaw` lands: the monster is within punchReach past contact (the mech's radius plus
 * `monsterRadius`) and within punchArc of the facing.
 */
export function punchHits(mech: Vec2, yaw: number, monster: Vec2, monsterRadius: number): boolean {
  const dx = monster.x - mech.x;
  const dz = monster.z - mech.z;
  const d = Math.hypot(dx, dz);
  if (d > CONFIG.mech.radius + monsterRadius + CONFIG.mech.punchReach) return false;
  return d < 1e-6 || Math.abs(angleDelta(yaw, Math.atan2(dx, dz))) <= CONFIG.mech.punchArc;
}

/** A slam lands: the monster is within slamRadius past contact (the mech's radius plus `monsterRadius`), any direction. */
export function slamHits(mech: Vec2, monster: Vec2, monsterRadius: number): boolean {
  return Math.hypot(monster.x - mech.x, monster.z - mech.z) <= CONFIG.mech.radius + monsterRadius + CONFIG.mech.slamRadius;
}
