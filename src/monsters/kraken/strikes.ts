import { angleDelta, yawTo, type Vec2 } from '../../util/math';
import { armAngle } from './crawl';

type Cand = { position: Vec2; radius: number; isAlive(): boolean };

/**
 * Pair free arms with targets within reach: nearest targets first, each taken by the remaining free arm
 * whose anchor points most nearly at it (bearing relative to the monster's facing `yaw`). One target per
 * arm, one arm per target; unmatched arms or targets are left out.
 */
export function assignStrikes<T extends Cand>(free: readonly number[], yaw: number, from: Vec2, targets: readonly T[], reach: number): { arm: number; target: T }[] {
  const dist = (c: T) => Math.hypot(c.position.x - from.x, c.position.z - from.z);
  const inReach = targets.filter((c) => c.isAlive() && dist(c) <= reach + c.radius).sort((a, b) => dist(a) - dist(b));
  const left = [...free];
  const out: { arm: number; target: T }[] = [];
  for (const target of inReach) {
    if (left.length === 0) break;
    const bearing = angleDelta(yaw, yawTo(from, target.position));
    let best = 0;
    for (let k = 1; k < left.length; k++) {
      if (Math.abs(angleDelta(armAngle(left[k]!), bearing)) < Math.abs(angleDelta(armAngle(left[best]!), bearing))) best = k;
    }
    out.push({ arm: left[best]!, target });
    left.splice(best, 1);
  }
  return out;
}
