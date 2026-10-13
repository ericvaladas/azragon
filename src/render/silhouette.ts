import type * as THREE from 'three';

const DARKEN = 'gl_FragColor.rgb *= 1.0 - uSilhouette;';

/**
 * Let every material under `root` be darkened toward a solid black silhouette by one shared `amount` (0 = normal,
 * 1 = black): one line just before fog, so the silhouette still fades into the distance. Each material keeps its own
 * shader hook and gets its own program key.
 */
export function addSilhouette(root: THREE.Object3D, amount: { value: number }): void {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      hook(mat, amount);
    }
  });
}

function hook(mat: THREE.Material, amount: { value: number }): void {
  const prev = mat.onBeforeCompile;
  // Read now: the default key is the hook's source, which is about to be replaced.
  const key = `${mat.customProgramCacheKey()}|silhouette`;
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    sh.uniforms['uSilhouette'] = amount;
    sh.fragmentShader = `uniform float uSilhouette;\n${sh.fragmentShader.replace('#include <fog_fragment>', `${DARKEN}\n#include <fog_fragment>`)}`;
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}
