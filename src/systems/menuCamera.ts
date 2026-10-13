import type * as THREE from 'three';
import { CONFIG } from '../config';

type Pose = { pos: THREE.Vector3; look: THREE.Vector3 };

/** Title: a slow, high circle around the city centre. */
export function titlePose(t: number, out: Pose): Pose {
  const T = CONFIG.menu.title;
  const a = T.startAngle + t * T.speed;
  out.pos.set(Math.sin(a) * T.radius, T.height, Math.cos(a) * T.radius);
  out.look.set(0, 0, 0);
  return out;
}

/**
 * Select: a turntable orbit of the monster at the origin, framed by its height.
 * Portrait screens (aspect < 1) orbit farther so the full width fits, and aim lower so the monster sits above the bottom panel.
 */
export function selectPose(t: number, monsterHeight: number, aspect: number, out: Pose): Pose {
  const S = CONFIG.menu.select;
  const a = S.startAngle + t * S.speed;
  const portrait = aspect < 1;
  const widen = portrait ? Math.min(1 / aspect, 2.2) : 1;
  const r = (monsterHeight * S.distance + S.pad) * widen;
  out.pos.set(Math.sin(a) * r, monsterHeight * S.lift, Math.cos(a) * r);
  out.look.set(0, monsterHeight * (portrait ? 0.25 : 0.45), 0);
  return out;
}
