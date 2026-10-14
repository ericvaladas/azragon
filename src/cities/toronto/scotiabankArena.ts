import type * as THREE from 'three';
import { box, merge } from '../shapes';

/** The arena's footprint (x × z) and the crown of its vaulted roof. */
export const SCOTIABANK_ARENA = { w: 140, d: 120, h: 46 } as const;
const WALL = 0xe8e3d8;
const BASE = 0xbcb5a9;
const BAND = 0x30353d;
const ROOF_A = 0xe4e6e8;
const ROOF_B = 0xcdd1d6;
const GLASS = 0x26323f;
const MULLION = 0x5a6a78;
/** Walls rise to EAVES; the vault, in VAULT_STRIPS strips across z, climbs from there to the full height. */
const EAVES = 32;
const VAULT_STRIPS = 11;

/**
 * Scotiabank Arena: a big pale box with a darker base, a dark band under the eaves and a vaulted roof (a barrel along
 * x, stepped in strips across z, in two pale greys), and a dark glass corner block at its north-west (−x, −z: the
 * corner toward the crash and the start camera) rising above the eaves. Base centre at the origin, +Y up,
 * vertex-coloured.
 */
export function scotiabankArenaGeometry(): THREE.BufferGeometry {
  const hw = SCOTIABANK_ARENA.w / 2, hd = SCOTIABANK_ARENA.d / 2;
  const parts: THREE.BufferGeometry[] = [];
  // Insets from the footprint's edge: walls 2 m, base and band 1.4 m, pilasters 1 m, glass 0.6 m, mullions 0.
  parts.push(box(-hw + 2, 0, -hd + 2, hw - 2, EAVES, hd - 2, WALL));
  parts.push(box(-hw + 1.4, 0, -hd + 1.4, hw - 1.4, 7, hd - 1.4, BASE));
  parts.push(box(-hw + 1.4, EAVES - 7, -hd + 1.4, hw - 1.4, EAVES - 3, hd - 1.4, BAND));
  // Pale pilasters up the long walls, between base and band.
  for (let x = -hw + 12; x <= hw - 12; x += 12) for (const s of [-1, 1]) parts.push(box(x - 1.2, 7, s > 0 ? hd - 2 : -hd + 1, x + 1.2, EAVES - 7, s > 0 ? hd - 1 : -hd + 2, BASE));
  // The vault: strip k spans z0..z1, its top on a quarter-cosine from the eaves (long walls) to the crown (middle).
  const span = SCOTIABANK_ARENA.d - 4;
  for (let k = 0; k < VAULT_STRIPS; k++) {
    const z0 = -span / 2 + (span * k) / VAULT_STRIPS;
    const z1 = z0 + span / VAULT_STRIPS;
    const zc = (z0 + z1) / 2;
    const top = EAVES + (SCOTIABANK_ARENA.h - EAVES) * Math.cos((Math.PI / 2) * Math.min(1, Math.abs(zc) / (span / 2 - span / VAULT_STRIPS / 2)));
    parts.push(box(-hw + 2, EAVES, z0, hw - 2, Math.max(EAVES + 1, top), z1, k % 2 ? ROOF_B : ROOF_A));
  }
  // The glass corner: dark glass with pale mullion bands, above the eaves.
  parts.push(box(-hw + 0.6, 0, -hd + 0.6, -hw + 35.4, 40, -hd + 33.4, GLASS));
  for (const y of [8, 16, 24, 32]) parts.push(box(-hw, y, -hd, -hw + 36, y + 0.8, -hd + 34, MULLION));
  return merge(parts);
}
