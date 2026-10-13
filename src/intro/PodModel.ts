import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted, toonMat } from '../render/toon';
import { mulberry32 } from '../util/rng';

/** Dark purple-brown chitin: groove, body and the paler crests and growths. */
const GROOVE = 0x1a0c15;
const SHELL = 0x3e2536;
const CREST = 0x6e4459;
const GROWTH = 0x8a5a6b;
const SPINE = 0x150a11;

/** Profile rings along the axis and segments around it. */
const RINGS = 14;
const SEGMENTS = 14;
/** Twisting ribs around the shell: count, twist along the length (rad per unit) and depth. */
const RIBS = 5;
const TWIST = 2.4;
const RIB_DEPTH = 0.07;
const NODULES = 18;
const SPINES = 6;

/** Radius of the egg profile at lathe height y (-0.5 tail .. 0.5 nose): the fat end is the nose. */
function profileRadius(a: number): number {
  return Math.sin(a) * 0.36 * (1 - 0.22 * Math.cos(a));
}

/** Rib relief -1..1 at angle `th` around the axis and height `y`: twisting ridges plus a slow lumpy wobble. */
function relief(th: number, y: number): number {
  return 0.75 * Math.cos(RIBS * th + TWIST * y) + 0.25 * Math.sin(3 * th - 7 * y + 1.3) * Math.sin(2 * th + 5 * y);
}

/** The lumpy, twisting-ribbed shell (lathe axis Y), coloured darker in the grooves and paler on the crests. */
function shellGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const a = (i / RINGS) * Math.PI;
    profile.push(new THREE.Vector2(profileRadius(a), -Math.cos(a) * 0.5));
  }
  const geo = new THREE.LatheGeometry(profile, SEGMENTS);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const groove = new THREE.Color(GROOVE);
  const shell = new THREE.Color(SHELL);
  const crest = new THREE.Color(CREST);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) {
      shell.toArray(colors, i * 3);
      continue;
    }
    const th = Math.atan2(x, z);
    const k = relief(th, y);
    const s = 1 + RIB_DEPTH * k;
    pos.setXYZ(i, x * s, y, z * s);
    // Three tones, stepped (not blended) so the pixel art reads as carved ridges.
    if (k < -0.35) c.copy(groove);
    else if (k > 0.45) c.copy(crest);
    else c.copy(shell);
    c.toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** A point on the shell surface (lathe space) at angle `th` and profile parameter `a`, pushed out by `lift`. */
function surfacePoint(th: number, a: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
  const y = -Math.cos(a) * 0.5;
  const r = profileRadius(a) * (1 + RIB_DEPTH * relief(th, y)) + lift;
  return out.set(Math.sin(th) * r, y, Math.cos(th) * r);
}

/** Knobbly growths, clustered on the crests toward the tail, half sunk into the shell. */
function nodules(rng: () => number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < NODULES; i++) {
    // Toward the tail (a near 0) and spread around it.
    const a = 0.35 + Math.pow(rng(), 1.4) * 1.9;
    let th = rng() * Math.PI * 2;
    // Nudge onto the nearest rib crest so the growths follow the ridges.
    const y = -Math.cos(a) * 0.5;
    th = (Math.round((th * RIBS + TWIST * y) / (Math.PI * 2)) * Math.PI * 2 - TWIST * y) / RIBS;
    const size = 0.03 + rng() * 0.035;
    surfacePoint(th, a, -size * 0.25, p);
    const g = new THREE.IcosahedronGeometry(size, 0).scale(1, 1.25, 1).rotateY(rng() * Math.PI).translate(p.x, p.y, p.z);
    out.push(painted(faceted(g), rng() < 0.4 ? CREST : GROWTH));
  }
  return out;
}

/** A crown of short, hooked spines around the tail, swept back and out. */
function spines(rng: () => number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < SPINES; i++) {
    const th = (i / SPINES) * Math.PI * 2 + 0.3;
    const len = 0.1 + rng() * 0.06;
    surfacePoint(th, 0.55, -0.01, p);
    const g = new THREE.ConeGeometry(0.028, len, 4)
      // Base at the origin, tip along -Y (backward along the lathe axis), then splayed outward (+Z, before the turn to th).
      .translate(0, len / 2, 0)
      .rotateX(Math.PI)
      .rotateX(-0.75)
      .rotateY(th)
      .translate(p.x, p.y, p.z);
    out.push(painted(faceted(g), SPINE));
  }
  return out;
}

/** The alien cocoon: a faceted, twist-ribbed chitin egg (blunt nose at +Z, length along Z), knobbly with growths and a spined tail. */
export class PodModel {
  readonly root = new THREE.Group();
  private mat: THREE.MeshToonMaterial;

  constructor(length: number) {
    const rng = mulberry32(7919);
    const parts = [faceted(shellGeometry()), ...nodules(rng), ...spines(rng)];
    for (const g of parts) g.deleteAttribute('uv');
    const geo = mergeGeometries(parts)!;
    for (const g of parts) g.dispose();
    // Lathe axis Y → Z: the fat end (+Y) becomes the nose.
    geo.rotateX(Math.PI / 2);
    this.mat = toonMat(0xffffff, { vertexColors: true });
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.castShadow = true;
    this.root.add(mesh);
    this.root.scale.setScalar(length);
  }

  /** Resize the cocoon (its length along Z, in metres). */
  setLength(length: number): void {
    this.root.scale.setScalar(length);
  }

  /** Re-entry glow on the shell (black = none). */
  setHeat(c: THREE.Color): void {
    this.mat.emissive.copy(c);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.mat.dispose();
  }
}
