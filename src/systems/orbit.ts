import { CONFIG } from '../config';

export type OrbitState = { yaw: number; pitch: number; distance: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Mouse: drag right → look right (yaw decreases, since +X is left), drag down → higher, steeper view. Touch grabs
 * the world instead, so both are flipped: drag right → look left, drag down → lower view.
 */
export function applyDrag(s: OrbitState, dxPx: number, dyPx: number, touch = false): OrbitState {
  const c = CONFIG.camera;
  const k = touch ? -c.dragSensitivity : c.dragSensitivity;
  return {
    ...s,
    yaw: s.yaw - dxPx * k,
    pitch: clamp(s.pitch + dyPx * k, c.minPitch, c.maxPitch),
  };
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
