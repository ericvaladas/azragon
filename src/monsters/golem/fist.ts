import { angleDelta, yawTo, type Vec2 } from '../../util/math';

export type FistKind = 'slam' | 'backhand';

/** Bearing of p from a body at `from` facing `yaw`: 0 dead ahead, + toward the body's left (+X), ±π behind. */
export function bearingTo(from: Vec2, yaw: number, p: Vec2): number {
  return angleDelta(yaw, yawTo(from, p));
}

/** Molten Fist: a target within `frontHalf` of dead ahead takes a slam; anything beside or behind, a backhand. */
export function fistKind(bearing: number, frontHalf: number): FistKind {
  return Math.abs(bearing) <= frontHalf ? 'slam' : 'backhand';
}

/** World yaw the backhand's hit arc is centred on: `centre` rad off the nose, on the target's side. */
export function backhandYaw(yaw: number, bearing: number, centre: number): number {
  return yaw + (bearing >= 0 ? centre : -centre);
}
