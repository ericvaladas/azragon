import * as THREE from 'three';

/**
 * One brick of the Shield Bubble: a triangle of the dome, its `corners`, the `center` it grows out of (the face's
 * own centre) and its `order` in the build (0 = laid first, 1 = last).
 */
export type ShieldBrick = {
  center: THREE.Vector3;
  order: number;
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
};

/**
 * Every triangle of a closed shield mesh as a brick, in the order the bubble builds them: from the ground up, with a
 * ring of bricks at the same height laying in a sweep around the dome.
 */
export function shieldBricks(geo: THREE.BufferGeometry): ShieldBrick[] {
  const p = geo.getAttribute('position');
  const v: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const out: ShieldBrick[] = [];
  for (let i = 0; i + 2 < p.count; i += 3) {
    for (let k = 0; k < 3; k++) v[k]!.fromBufferAttribute(p, i + k);
    out.push({
      // A geodesic face's centre points straight out along its own normal, so it is both the pivot and the facing.
      center: new THREE.Vector3().addVectors(v[0], v[1]).add(v[2]).multiplyScalar(1 / 3),
      order: 0,
      corners: [v[0].clone(), v[1].clone(), v[2].clone()],
    });
  }
  // Bricks at the same height lay together: the height is rounded so the geodesic's exact ties still tie, and the
  // sweep around the dome follows the azimuth.
  const band = (b: ShieldBrick) => Math.round(b.center.y * 1e4);
  const azimuth = (b: ShieldBrick) => Math.atan2(b.center.x, b.center.z);
  out.sort((a, b) => band(a) - band(b) || azimuth(a) - azimuth(b));
  out.forEach((b, i) => (b.order = i / (out.length - 1)));
  return out;
}

/**
 * The dome, rebuilt brick by brick: `fill` the faces, `wire` one triangle outline per brick (every edge lies in two
 * bricks, so the lattice is drawn twice and its material is halved to match). Both carry `aBrick` = vec4(centre,
 * order) per vertex, which is what patchShieldBuild animates. Neither needs normals: the dome is unlit.
 */
export function shieldDome(geo: THREE.BufferGeometry): { fill: THREE.BufferGeometry; wire: THREE.BufferGeometry } {
  const bricks = shieldBricks(geo.index ? geo.toNonIndexed() : geo);
  const n = bricks.length;
  const faces = new Float32Array(n * 9);
  const outlines = new Float32Array(n * 18);
  const faceBricks = new Float32Array(n * 12);
  const outlineBricks = new Float32Array(n * 24);
  bricks.forEach((b, i) => {
    const [p0, p1, p2] = b.corners;
    faces.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z], i * 9);
    // Three segments per brick, each from its own corner to the next, in brick order.
    outlines.set(
      [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p2.x, p2.y, p2.z, p0.x, p0.y, p0.z],
      i * 18,
    );
    // Every vertex of a brick carries the same centre and the same place in the build.
    const brick = [b.center.x, b.center.y, b.center.z, b.order];
    for (let k = 0; k < 3; k++) faceBricks.set(brick, i * 12 + k * 4);
    for (let k = 0; k < 6; k++) outlineBricks.set(brick, i * 24 + k * 4);
  });
  const fill = new THREE.BufferGeometry();
  fill.setAttribute('position', new THREE.BufferAttribute(faces, 3));
  fill.setAttribute('aBrick', new THREE.BufferAttribute(faceBricks, 4));
  const wire = new THREE.BufferGeometry();
  wire.setAttribute('position', new THREE.BufferAttribute(outlines, 3));
  wire.setAttribute('aBrick', new THREE.BufferAttribute(outlineBricks, 4));
  return { fill, wire };
}

/** How far the build has got `t` seconds after the bubble went up: it rises fast, then settles (0 = empty, 1 = done). */
export function shieldBuildProgress(t: number, duration: number): number {
  const k = Math.min(1, Math.max(0, t) / duration);
  return 1 - Math.pow(1 - k, 3);
}

/**
 * Let a dome build itself and fade away: every brick grows out of its own centre with a little overshoot as the front
 * rises, and glows as it lands. `build` is the shared build uniform (see shieldBuildProgress) and `fade` the shared
 * brightness of the whole dome (1 = up, 0 = gone); `window` the share of the build one brick spends opening (the rest
 * is the front's climb); `flash` how much brighter a brick glows the moment it lands — the dome is additive, so a
 * glowing brick blows out toward white.
 */
export function patchShieldDome(
  mat: THREE.Material,
  o: { build: { value: number }; fade: { value: number }; window: number; flash: number },
): void {
  const prev = mat.onBeforeCompile;
  // Read now: the default key is the hook's source, which is about to be replaced.
  const key = `${mat.customProgramCacheKey()}|shield-dome`;
  // The front climbs the dome over the part of the build no brick spends opening of its own.
  const climb = (1 - o.window).toFixed(3);
  const w = o.window.toFixed(3);
  const flash = o.flash.toFixed(1);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    sh.uniforms['uBuild'] = o.build;
    sh.uniforms['uFade'] = o.fade;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aBrick;\nvarying float vBrick;\nuniform float uBuild;')
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '  // How far this brick has opened: vBrick runs 0 to 1 as the rising front passes it.',
          `  vBrick = clamp((uBuild - aBrick.w * ${climb}) / ${w}, 0.0, 1.0);`,
          '  // easeOutBack: it grows out of its own centre, overshooting its size slightly as it snaps into place.',
          '  // (Written with 1 - vBrick: GLSL pow is undefined for a negative base.)',
          '  float settle = 1.0 - vBrick;',
          '  transformed = mix(aBrick.xyz, transformed, max(1.0 + 1.70158 * settle * settle - 2.70158 * settle * settle * settle, 0.0));',
        ].join('\n'),
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBrick;\nuniform float uFade;')
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        [
          'vec4 diffuseColor = vec4( diffuse, opacity * vBrick * uFade );',
          `  // A brand-new brick glows, blowing out toward white; a finished one settles to the dome's own opacity.`,
          `  diffuseColor.rgb *= 1.0 + ${flash} * (1.0 - vBrick) * (1.0 - vBrick);`,
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => key;
}
