import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Shared 3-step light ramp: shadow, mid, lit. */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMat(
  color: THREE.ColorRepresentation,
  opts: { emissive?: THREE.ColorRepresentation; map?: THREE.Texture; vertexColors?: boolean } = {},
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: opts.emissive ?? 0x000000,
    map: opts.map ?? null,
    vertexColors: opts.vertexColors ?? false,
  });
}

/** Give every vertex of `geo` one colour (for multi-coloured merged meshes drawn with vertexColors). */
export function painted(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}

/** Non-indexed copy with per-face normals, for a faceted low-poly look under toon shading. */
export function faceted(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo.clone();
  out.computeVertexNormals();
  return out;
}
