import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../../render/toon';

const ORANGE = 0xe8502a;
const WHITE = 0xf2f0ea;
const DECK = 0xdcdad4;
const GLASS = 0x3d4a5e;

/** A square frustum (corners on the diagonals) from y0 to y1, half-widths hw0 → hw1. */
const frustum = (hw0: number, hw1: number, y0: number, y1: number, color: number, sides = 4) =>
  painted(faceted(new THREE.CylinderGeometry(hw1 * Math.SQRT2, hw0 * Math.SQRT2, y1 - y0, sides).rotateY(Math.PI / sides).translate(0, (y0 + y1) / 2, 0)), color);

/** A strut from a to b with square cross-section `t`. */
function strut(a: THREE.Vector3, b: THREE.Vector3, t: number, color: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(t, dir.length(), t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return painted(faceted(g), color);
}

const merge = (parts: THREE.BufferGeometry[]) => {
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
};

/** Drawn 1.3 × life size, so it holds the skyline at game scale. */
const TT_SCALE = 1.3;
export const TOKYO_TOWER = { w: 100 * TT_SCALE, d: 100 * TT_SCALE, h: 380 * TT_SCALE } as const;

/** Tokyo Tower: four splayed legs, an orange-and-white banded lattice shaft, two decks and an antenna. */
export function tokyoTowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    parts.push(strut(new THREE.Vector3(sx * 44, 0, sz * 44), new THREE.Vector3(sx * 24, 95, sz * 24), 10, ORANGE));
    // Cross braces between neighbouring legs, white.
    parts.push(strut(new THREE.Vector3(sx * 40, 30, sz * 40), new THREE.Vector3(sx * 40, 30, -sz * 40), 4, WHITE));
  }
  parts.push(frustum(30, 26, 90, 100, WHITE));
  const bands = [[100, 125, ORANGE], [125, 150, WHITE]] as const;
  for (const [y0, y1, c] of bands) parts.push(frustum(26 - (y0 - 100) * 0.16, 26 - (y1 - 100) * 0.16, y0, y1, c));
  // Main deck.
  parts.push(frustum(26, 26, 150, 158, DECK), frustum(27, 27, 158, 164, GLASS), frustum(25, 22, 164, 170, DECK));
  const upper = [[170, 195, ORANGE], [195, 220, WHITE], [220, 245, ORANGE]] as const;
  for (const [y0, y1, c] of upper) parts.push(frustum(14 - (y0 - 170) * 0.07, 14 - (y1 - 170) * 0.07, y0, y1, c));
  // Top deck, then the antenna in bands.
  parts.push(frustum(11, 11, 245, 250, DECK), frustum(11.5, 11.5, 250, 254, GLASS), frustum(9, 6, 254, 258, DECK));
  const mast = [[258, 290, ORANGE], [290, 320, WHITE], [320, 350, ORANGE], [350, 380, WHITE]] as const;
  for (const [y0, y1, c] of mast) parts.push(frustum(4 - (y0 - 258) * 0.02, 4 - (y1 - 258) * 0.02, y0, y1, c));
  const g = merge(parts);
  // The splayed legs' box corners dip below the ground; flatten them onto y = 0 so the base sits on it.
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, 0);
  return g.scale(TT_SCALE, TT_SCALE, TT_SCALE);
}

const STEEL = 0xe4ebf0;
const STEEL_DARK = 0xb9c7d2;

export const SKYTREE = { w: 90, d: 90, h: 600 } as const;

/** Tokyo Skytree: a pale steel spire, tripod-to-round, with two ringed observation decks and a long mast. */
export function skytreeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    frustum(42, 30, 0, 120, STEEL_DARK, 3),
    frustum(30, 20, 120, 340, STEEL, 6),
    frustum(30, 30, 340, 350, STEEL),
    frustum(31, 31, 350, 366, GLASS, 8),
    frustum(30, 16, 366, 380, STEEL, 8),
    frustum(16, 13, 380, 445, STEEL, 6),
    frustum(20, 20, 445, 452, GLASS, 8),
    frustum(19, 10, 452, 462, STEEL, 8),
    frustum(8, 4, 462, 540, STEEL, 6),
    frustum(4, 1.5, 540, 600, STEEL_DARK, 6),
  ];
  return merge(parts);
}
