import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Atmosphere } from '../cities/types';
import { fogDistances } from './atmosphere';

/** Gradient dome (horizon → zenith) that ignores fog, plus scene fog tinted by the atmosphere. */
export function createSky(scene: THREE.Scene, a: Atmosphere): THREE.Mesh {
  const geo = new THREE.SphereGeometry(CONFIG.camera.far * 0.9, 16, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(a.skyZenith) },
      horizon: { value: new THREE.Color(a.skyHorizon) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 zenith;
      uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float t = clamp(vDir.y * 2.2, 0.0, 1.0);
        t = floor(t * 6.0) / 6.0; // banded gradient reads as pixel art
        gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  const f = fogDistances(a);
  scene.fog = new THREE.Fog(a.fog, f.near, f.far);
  return sky;
}

/** The dome's two gradient colours (its uniform values), for applyAtmosphere. */
export function skyColors(sky: THREE.Mesh): { zenith: THREE.Color; horizon: THREE.Color } {
  const u = (sky.material as THREE.ShaderMaterial).uniforms;
  return { zenith: u['zenith']!.value as THREE.Color, horizon: u['horizon']!.value as THREE.Color };
}
