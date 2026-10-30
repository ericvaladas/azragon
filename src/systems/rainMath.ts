import type * as THREE from 'three';

/** A fixed hash of an integer and a salt to 0..1. */
function hash(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Rain drop `i`'s offset at time `t` in a box `size` wide (centred on x/z) and `height` tall (from 0): x/z and a
 * starting phase from a fixed hash of `i`; it falls at `speed` (each drop up to 30% faster) and wraps to the top.
 */
export function rainDrop(i: number, t: number, box: { size: number; height: number }, speed: number, out: THREE.Vector3): THREE.Vector3 {
  const fall = speed * (1 + 0.3 * hash(i, 3));
  const y = box.height * (1 - hash(i, 4)) - fall * t;
  const h = box.height;
  return out.set((hash(i, 1) - 0.5) * box.size, ((y % h) + h) % h, (hash(i, 2) - 0.5) * box.size);
}
