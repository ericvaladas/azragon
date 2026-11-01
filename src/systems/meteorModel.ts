import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import { faceted } from '../render/toon';

const P = CONFIG.palette;

/** One crystal spike: an elongated octahedron, tilted and moved, shaded body → core → glow up its height. */
function spike(radius: number, stretch: number, tilt: number, spin: number, at: [number, number, number]): THREE.BufferGeometry {
  const g = faceted(new THREE.OctahedronGeometry(radius));
  g.scale(1, stretch, 1);
  g.rotateY(spin);
  g.rotateZ(tilt);
  g.translate(at[0], at[1], at[2]);
  const pos = g.getAttribute('position');
  const body = new THREE.Color(P.meteor);
  const core = new THREE.Color(P.meteorCore);
  const glow = new THREE.Color(P.meteorGlow);
  const c = new THREE.Color();
  const data = new Float32Array(pos.count * 3);
  const half = radius * stretch;
  for (let i = 0; i < pos.count; i++) {
    const h = (pos.getY(i) - at[1]) / half; // -1 at the lower tip, 1 at the upper
    if (h > 0.6) c.copy(glow);
    else if (h < -0.2) c.copy(core);
    else c.copy(body);
    data.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}

/** The alien-diamond cluster, about one unit tall and centred on the origin: a main gem and three smaller spikes, vertex-coloured. */
export function meteorGeometry(): THREE.BufferGeometry {
  const parts = [
    spike(0.3, 1.7, 0, 0.3, [0, 0, 0]),
    spike(0.17, 1.6, 0.55, 1.1, [0.27, -0.2, 0.05]),
    spike(0.15, 1.5, -0.6, 0.6, [-0.25, -0.22, -0.1]),
    spike(0.13, 1.4, 0.35, 2.0, [0.03, -0.25, -0.26]),
  ];
  const geo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return geo;
}
