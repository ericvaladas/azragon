import { CONFIG } from '../config';
import { angleDelta } from '../util/math';

export type OrbitState = { yaw: number; pitch: number; distance: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Drag right → look right (yaw decreases, since +X is left). Drag down → higher, steeper view. */
export function applyDrag(s: OrbitState, dxPx: number, dyPx: number): OrbitState {
  const c = CONFIG.camera;
  return {
    ...s,
    yaw: s.yaw - dxPx * c.dragSensitivity,
    pitch: clamp(s.pitch + dyPx * c.dragSensitivity, c.minPitch, c.maxPitch),
  };
}

/** Swing the orbit toward `yaw` (behind a monster facing it) the short way round, by exponential decay at `lambda`/s. */
export function swingBehind(s: OrbitState, yaw: number, lambda: number, dt: number): OrbitState {
  return { ...s, yaw: s.yaw + angleDelta(s.yaw, yaw) * (1 - Math.exp(-lambda * dt)) };
}

export function applyZoom(s: OrbitState, wheelDeltaY: number): OrbitState {
  const c = CONFIG.camera;
  return { ...s, distance: clamp(s.distance + wheelDeltaY * c.wheelSensitivity, c.minDistance, c.maxDistance) };
}

/** Over-the-right-shoulder pose around a target on the ground (the monster's root). */
export function cameraPose(
  s: OrbitState,
  t: { x: number; y: number; z: number },
): { pos: [number, number, number]; look: [number, number, number] } {
  const c = CONFIG.camera;
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const rx = -Math.cos(s.yaw); // character right is -X at yaw 0
  const rz = Math.sin(s.yaw);
  const back = Math.cos(s.pitch) * s.distance;
  const up = Math.sin(s.pitch) * s.distance;
  return {
    pos: [t.x - fx * back + rx * c.shoulderOffset, t.y + c.shoulderHeight + up, t.z - fz * back + rz * c.shoulderOffset],
    look: [t.x + fx * c.lookAhead + rx * c.shoulderOffset * 0.5, t.y + c.shoulderHeight * 0.55, t.z + fz * c.lookAhead + rz * c.shoulderOffset * 0.5],
  };
}

/** Vertical FOV (deg) that keeps horizontal FOV at or under maxHFovDeg. */
export function fovForAspect(aspect: number, baseVFovDeg: number, maxHFovDeg: number): number {
  const toRad = Math.PI / 180;
  const h = 2 * Math.atan(Math.tan((baseVFovDeg * toRad) / 2) * aspect);
  if (h <= maxHFovDeg * toRad) return baseVFovDeg;
  return (2 * Math.atan(Math.tan((maxHFovDeg * toRad) / 2) / aspect)) / toRad;
}

/** The orbit `a` blended toward a cinematic `b` by k (pitch and distance exact at 0 and 1; yaw kept, or turned the short way round to `b.yaw` when given). */
export function blendOrbit(a: OrbitState, b: Pick<OrbitState, 'pitch' | 'distance'> & { yaw?: number }, k: number): OrbitState {
  const yaw = b.yaw === undefined ? a.yaw : a.yaw + angleDelta(a.yaw, b.yaw) * k;
  return { yaw, pitch: a.pitch * (1 - k) + b.pitch * k, distance: a.distance * (1 - k) + b.distance * k };
}
