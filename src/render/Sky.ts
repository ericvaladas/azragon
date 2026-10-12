import * as THREE from 'three';
import { CONFIG } from '../config';

/** Gradient dome (horizon → zenith) that ignores fog, plus scene fog tinted to the horizon. */
export function createSky(scene: THREE.Scene): THREE.Mesh {
  const { skyZenith, skyHorizon, fog } = CONFIG.palette;
  const geo = new THREE.SphereGeometry(CONFIG.camera.far * 0.9, 16, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(skyZenith) },
      horizon: { value: new THREE.Color(skyHorizon) },
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
  scene.fog = new THREE.Fog(fog, CONFIG.fog.near, CONFIG.fog.far);
  return sky;
}
