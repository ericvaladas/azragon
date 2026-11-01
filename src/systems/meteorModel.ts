import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted } from '../render/toon';

const P = CONFIG.palette;

/** Gem half-width and the stretch of its height over its width. */
const RADIUS = 0.32;
const STRETCH = 1.55;

/** The alien diamond: one faceted elongated octahedron (a single top and bottom apex), about one unit tall and centred on the origin, shaded core (bottom) → body → glow (top) in vertex colours. */
export function meteorGeometry(): THREE.BufferGeometry {
  const g = faceted(new THREE.OctahedronGeometry(RADIUS));
  g.scale(1, STRETCH, 1);
  const pos = g.getAttribute('position');
  const body = new THREE.Color(P.meteor);
  const core = new THREE.Color(P.meteorCore);
  const glow = new THREE.Color(P.meteorGlow);
  const c = new THREE.Color();
  const data = new Float32Array(pos.count * 3);
  const half = RADIUS * STRETCH;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / half; // -1 at the bottom apex, 1 at the top
    if (h > 0.6) c.copy(glow);
    else if (h < -0.6) c.copy(core);
    else c.copy(body);
    data.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}
