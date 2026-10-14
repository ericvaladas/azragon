import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../render/toon';
import { mulberry32 } from '../util/rng';

/** Scorched base, dark broken concrete in a few tones, and the odd darker steel beam. */
const SCORCH = 0x2b2724;
const CHUNKS = [0x3a3531, 0x47413b, 0x544d45, 0x625a50, 0x3f3b38] as const;
const STEEL = 0x4a4e54;

/**
 * One ruin, in a unit footprint (x, z in ±0.55) and unit height (base at y = 0, tallest chunk at y = 1): a flat
 * scorched slab with a heap of faceted chunks of broken concrete and a few bent beams. Vertex-coloured, so one
 * instanced mesh draws every ruin; each instance is scaled to its building's footprint and a fraction of its height.
 */
export function rubbleGeometry(): THREE.BufferGeometry {
  const rng = mulberry32(4243);
  const parts: THREE.BufferGeometry[] = [painted(faceted(new THREE.BoxGeometry(1.1, 0.03, 1.1).translate(0, 0.015, 0)), SCORCH)];
  // The heap: one big central mound and smaller chunks scattered around it, lower toward the edges.
  parts.push(painted(faceted(new THREE.DodecahedronGeometry(0.5, 0).scale(1, 1, 1).translate(0, 0.5, 0)), CHUNKS[1]));
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.15 + rng() * 0.32;
    const s = 0.12 + rng() * 0.16;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = s * (0.6 + rng() * 0.6) * (1 - r);
    const geo = rng() < 0.5 ? new THREE.DodecahedronGeometry(0.5, 0) : new THREE.TetrahedronGeometry(0.6, 0);
    geo.scale(s * 2, h * 2, s * 2).rotateY(rng() * Math.PI).translate(x, h, z);
    parts.push(painted(faceted(geo), CHUNKS[i % CHUNKS.length]!));
  }
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI;
    const beam = new THREE.BoxGeometry(0.7, 0.04, 0.04).rotateZ(0.3 + rng() * 0.3).rotateY(a).translate((rng() - 0.5) * 0.4, 0.35 + rng() * 0.2, (rng() - 0.5) * 0.4);
    parts.push(painted(faceted(beam), STEEL));
  }
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  // Normalise: base at y = 0, top at y = 1, inside the unit footprint.
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const reach = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
  const fit = Math.min(1, 0.55 / reach);
  g.translate(0, -bb.min.y, 0).scale(fit, 1 / (bb.max.y - bb.min.y), fit);
  return g;
}
