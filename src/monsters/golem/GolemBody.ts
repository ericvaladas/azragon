import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, painted, toonMat } from '../../render/toon';
import { solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { fistKind, lungeAmount, lungeWeight, strikeReturn, strikeStarted, type FistKind } from './fist';
import { FireTendrils } from './FireTendrils';
import { merge, piece, rng, SHAPES, type V3 } from './golemParts';
import { SWING, limbPlanted, limbSwing } from './knuckleGait';

const G = CONFIG.golem;
const C = G.colors;
/** Model units (before CONFIG.monster.scale). The torso pivots here (just behind the hips). */
const PIVOT = new THREE.Vector3(0, 250, -60);
const UPPER = 250;
const FORE = 260;
const THIGH = 150;
const SHIN = 150;
const FIST_R = 85;
/** Torso-space shoulder and hip on the left (+X); the right mirrors x. */
const SHOULDER = new THREE.Vector3(200, 480, 80);
const HIP = new THREE.Vector3(110, 330, -130);
/** Root-space rest spots (left side) of a planted hand (its palm) and hoof, and how high each lifts mid-swing. */
const FIST_AT = new THREE.Vector3(250, FIST_R, 230);
const FOOT_AT = new THREE.Vector3(150, 0, -130);
/** The hock (heel) of the digitigrade hind leg, relative to its hoof: the leg's IK ends here; the cannon bone runs down to the hoof. */
const HOCK = new THREE.Vector3(0, 130, -45);
const FIST_LIFT = 130;
const FOOT_LIFT = 70;
/**
 * Slam: where the hand rises (left side) before it drops, out wide of the antlers. Backhand: where it cocks across
 * the chest, and its sweep radius.
 */
const SLAM_RAISE = new THREE.Vector3(330, 560, 190);
const BACKHAND_COCK = new THREE.Vector3(-60, 280, 320);
const BACKHAND_R = 450;
const ARM_REACH = UPPER + FORE - 30;
/**
 * Molten Fist lunge: for a target farther than the hand reaches standing (LUNGE_FROM for a slam, BACKHAND_R for a
 * backhand), the torso shifts toward the strike by the shortfall (up to LUNGE_MAX), sinks up to LUNGE_DROP and leans
 * up to LUNGE_LEAN rad, so the hand reaches it.
 */
const LUNGE_FROM = 380;
const LUNGE_MAX = 200;
const LUNGE_DROP = 60;
const LUNGE_LEAN = 0.25;
/** Molten Fist: seconds the hand stays on its target after impact before it eases home. */
const STRIKE_HOLD = 0.1;
/** Eruption: seconds for both hands to rise and slam. */
const NOVA_TIME = 0.6;

/** The spine (torso space): from the sacrum up over the high hunched arch above the shoulder blades, down the neck to the skull. */
const SPINE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 360, -180),
  new THREE.Vector3(0, 455, -115),
  new THREE.Vector3(0, 570, -35),
  new THREE.Vector3(0, 640, 55),
  new THREE.Vector3(0, 618, 150),
  new THREE.Vector3(0, 560, 228),
  new THREE.Vector3(0, 528, 272),
]);

/**
 * The ribcage (torso space): a barrel along z hanging under the spine. Its cross-section at z is an ellipse of
 * half-width CAGE_X·r(z) and half-height CAGE_H·r(z) about y = CAGE_Y; `theta` runs around it (0 = top, π/2 = left).
 */
const CAGE_Y = 458;
const CAGE_X = 112;
const CAGE_H = 162;
const CAGE_Z: readonly (readonly [number, number])[] = [
  [-55, 0.15], [-35, 0.5], [-5, 0.8], [40, 0.96], [90, 1], [140, 0.95], [180, 0.84], [215, 0.64], [240, 0.4], [255, 0.12],
];
/** The skin ends here, open on the hellfire inside the chest. */
const CHEST_Z = 214;
/** Rib pairs: the z where each leaves the spine, and how far round (theta) it reaches; the back ones float short. */
const RIBS: readonly (readonly [number, number])[] = [[178, 2.75], [140, 2.75], [102, 2.6], [64, 2.35], [26, 2.1], [-10, 1.8]];
/** How far (z) a rib slants back between the spine and the bottom of the cage. */
const RIB_SLANT = 46;

function cageR(z: number): number {
  const first = CAGE_Z[0]!;
  if (z <= first[0]) return first[1];
  for (let i = 1; i < CAGE_Z.length; i++) {
    const [z1, r1] = CAGE_Z[i]!;
    const [z0, r0] = CAGE_Z[i - 1]!;
    if (z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
  }
  return CAGE_Z[CAGE_Z.length - 1]![1];
}

function cageRaw(theta: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const r = cageR(z);
  return out.set(Math.sin(theta) * CAGE_X * r, CAGE_Y + Math.cos(theta) * CAGE_H * r, z);
}

const _ea = new THREE.Vector3();
const _eb = new THREE.Vector3();
const _ec = new THREE.Vector3();
/** The point at (theta, z) on the ribcage skin, lifted `lift` along its outward normal (written to `nrm` when given). */
function cageAt(theta: number, z: number, lift = 0, out = new THREE.Vector3(), nrm?: THREE.Vector3): THREE.Vector3 {
  cageRaw(theta + 0.01, z, _ea).sub(cageRaw(theta - 0.01, z, _eb));
  cageRaw(theta, z + 0.5, _eb).sub(cageRaw(theta, z - 0.5, _ec));
  _ec.crossVectors(_eb, _ea).normalize();
  cageRaw(theta, z, out);
  if (_ec.x * out.x + _ec.y * (out.y - CAGE_Y) < 0) _ec.negate();
  if (nrm) nrm.copy(_ec);
  return out.addScaledVector(_ec, lift);
}

/** A rib's point at `theta` (signed: + left, − right): on the cage, slanting back as it runs down. */
function ribAt(z: number, theta: number, lift: number, out: THREE.Vector3, nrm?: THREE.Vector3): THREE.Vector3 {
  return cageAt(theta, z - RIB_SLANT * (Math.abs(theta) / Math.PI), lift, out, nrm);
}

/** Fire tendrils rise from the spine away from this point (torso space): deep in the ribcage. */
const HUMP_CENTRE = new THREE.Vector3(0, CAGE_Y - 40, 60);
/** Fire tendrils (torso space): two pairs of smouldering wounds either side of the spine, between the shoulder blades. */
const TENDRIL_ROOTS: readonly THREE.Vector3[] = [0.5, 0.6].flatMap((u) => {
  const p = SPINE.getPointAt(u);
  return [1, -1].map((sx) => p.clone().add(new THREE.Vector3(sx * 30, 14, 0)));
});
/** The skull (torso space): hung low and forward on the neck, the snout pitched down HEAD_PITCH rad. */
const HEAD_AT = new THREE.Vector3(0, 515, 305);
const HEAD_PITCH = 0.5;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _at = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _lx = new THREE.Vector3();
const _ref = new THREE.Vector3();
const _ly = new THREE.Vector3();
const _lz = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _gait = new THREE.Vector3();
const _fist = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _hock = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _raise = new THREE.Vector3();
const _end = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();
const _lunge = new THREE.Vector3();
const _rel = new THREE.Matrix4();

/** Extra unit shapes: an eight-sided tube, a snout tapering toward +Y, a round disc (axis Y), and a triangular prism. */
const TUBE = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
const SNOUT = faceted(new THREE.CylinderGeometry(0.28, 0.5, 1, 7));
const LENS = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
const TRI = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 3));
/** Ball and lumpy knob of diameter 1 (SHAPES.blob and .boulder are radius 1). */
const BALL = faceted(new THREE.IcosahedronGeometry(0.5, 1));
const NUB = faceted(new THREE.IcosahedronGeometry(0.5, 0));

/** Matrix placing a part at `pos` with its local +Y along `dir`, turned `spin` rad about it. */
function along(pos: THREE.Vector3, dir: THREE.Vector3, spin = 0, out = new THREE.Matrix4()): THREE.Matrix4 {
  _q.setFromUnitVectors(_up, _tmp.copy(dir).normalize()).multiply(_q2.setFromAxisAngle(_up, spin));
  return out.compose(pos, _q, _s.set(1, 1, 1));
}

function v3(v: THREE.Vector3): V3 {
  return [v.x, v.y, v.z];
}

/** A tube (`shape`, radius 0.5 units) of radius r from a to b, appended painted. */
function strut(out: THREE.BufferGeometry[], shape: THREE.BufferGeometry, color: number, a: V3, b: V3, r: number): void {
  const pa = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(pa);
  const len = d.length();
  if (len < 1e-3) return;
  piece(out, shape, color, [0, 0, 0], [r * 2, len, r * 2], [0, 0, 0], along(pa.addScaledVector(d, 0.5), d));
}

/** Strip (unit-box matrix) from a to b on a surface with outward normal n, `w` wide and `t` thick. */
function stripMatrix(a: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3, w: number, t = 8): THREE.Matrix4 {
  _lx.subVectors(b, a);
  const len = _lx.length();
  _lx.divideScalar(len);
  _lz.copy(n).addScaledVector(_lx, -n.dot(_lx)).normalize();
  _ly.crossVectors(_lz, _lx);
  return new THREE.Matrix4()
    .makeBasis(_lx, _ly, _lz)
    .scale(_s.set(len + w * 0.3, w, t))
    .setPosition(_at.addVectors(a, b).multiplyScalar(0.5));
}

/** Non-indexed geometry from a flat triangle list, with face normals and blank uvs (so it merges with the primitives). */
function rawGeometry(v: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A flat slab `thick` deep over a convex polygon (points in order), appended painted. Its face turns toward `face`.
 * For the shoulder blades, hip blades and hide strips.
 */
function slab(out: THREE.BufferGeometry[], color: number, poly: readonly THREE.Vector3[], face: THREE.Vector3, thick: number): void {
  const n = new THREE.Vector3().crossVectors(_tmp.subVectors(poly[1]!, poly[0]!), _dir.subVectors(poly[2]!, poly[0]!)).normalize();
  const pts = n.dot(face) < 0 ? [...poly].reverse() : [...poly];
  if (n.dot(face) < 0) n.negate();
  const top = pts.map((p) => p.clone().addScaledVector(n, thick / 2));
  const bot = pts.map((p) => p.clone().addScaledVector(n, -thick / 2));
  const v: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 1; i + 1 < pts.length; i++) {
    tri(top[0]!, top[i]!, top[i + 1]!);
    tri(bot[0]!, bot[i + 1]!, bot[i]!);
  }
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    tri(top[i]!, bot[i]!, bot[j]!);
    tri(top[i]!, bot[j]!, top[j]!);
  }
  out.push(painted(rawGeometry(v), color));
}

/** A tapering branch through `pts`: radius r0 at the first point to r1 at the last, knuckled at each bend, a spike at the tip. */
function branch(out: THREE.BufferGeometry[], color: number, pts: readonly THREE.Vector3[], r0: number, r1: number): void {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const r = r0 + ((r1 - r0) * i) / n;
    const last = i === n - 1;
    strut(out, last ? SHAPES.spike : TUBE, color, v3(pts[i]!), v3(pts[i + 1]!), last ? r * 1.25 : r);
    if (!last) piece(out, NUB, color, v3(pts[i + 1]!), [r * 2.3, r * 2.3, r * 2.3]);
  }
}

/**
 * A jagged ember crack (limb space) running `len` up a limb of radius r from height y, starting round it at angle a.
 */
function crack(out: THREE.BufferGeometry[], y: number, r: number, a: number, len: number): void {
  const pts = [0, 0.4, 0.7, 1].map((u, i) => {
    const t = a + (i % 2 ? 0.35 : -0.05) + u * 0.2;
    return [Math.sin(t) * (r - 1), y + u * len, Math.cos(t) * (r - 1)] as const;
  });
  for (let i = 0; i + 1 < pts.length; i++) strut(out, TUBE, C.glow, pts[i]!, pts[i + 1]!, 6 - i);
}

/**
 * Stretch a height-1, centred limb mesh from a to b (like placeSegment), turned about its axis so its local +Z
 * leans toward `ref` (the IK bend direction): a stable twist, so the knobs and sinews never spin.
 */
function placeLimb(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, ref: THREE.Vector3): void {
  _ly.subVectors(b, a);
  const len = _ly.length();
  obj.position.addVectors(a, b).multiplyScalar(0.5);
  obj.scale.y = len;
  if (len < 1e-6) return;
  _ly.divideScalar(len);
  _lz.copy(ref).addScaledVector(_ly, -ref.dot(_ly));
  if (_lz.lengthSq() < 1e-6) _lz.set(0, 0, 1).addScaledVector(_ly, -_ly.z);
  _lz.normalize();
  _lx.crossVectors(_ly, _lz);
  obj.quaternion.setFromRotationMatrix(_m.makeBasis(_lx, _ly, _lz));
}

/** v with x mirrored to side sx (+1 left, −1 right). */
function mirror(v: THREE.Vector3, sx: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v.x * sx, v.y, v.z);
}

type Arm = { upper: THREE.Mesh; fore: THREE.Mesh; fist: THREE.Mesh };
type Leg = { thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh };

/**
 * The Magma Golem, built as a hellfire wendigo: a gaunt, starved, corpse-grey thing that creeps on very long arms
 * and needle-fingered hands, its spine arched high in a ridge of vertebra knobs between sharp shoulder blades.
 * Hellfire burns inside it: between its ribs, in the eye sockets of its bleached deer skull, in its joints and in
 * cracks along its spine. A great rack of jagged antlers; digitigrade hind legs on cloven hooves; tattered hide
 * hanging off its flanks. Spectral fire tendrils rise off its spine and whip at flyers; three ember wounds on its
 * back lob magma. Faces +Z; +X is its left.
 */
export class GolemBody implements MonsterBody {
  readonly root = new THREE.Group();
  /** Pivots at PIVOT; `shell` (offset by −PIVOT) holds the torso parts in root-like coordinates. */
  private body = new THREE.Group();
  private shell = new THREE.Group();
  /** Named `limbArms`: `arms` is MonsterBody's optional tentacle hook (the 4b Kaiju collision). */
  private limbArms: Arm[] = [];
  private legs: Leg[] = [];
  private tintMats: THREE.MeshToonMaterial[];
  /** One vertex-coloured material for the whole torso, skull, antlers and limbs. */
  private bodyMat: THREE.MeshToonMaterial;
  /** Embers in the joints and at the tendril wounds. */
  private jointMat: THREE.MeshToonMaterial;
  /** Smouldering cracks along the spine. */
  private seamMat: THREE.MeshToonMaterial;
  /** Hellfire between the ribs (the Molten Core). */
  private coreMat: THREE.MeshToonMaterial;
  private eyeMat: THREE.MeshToonMaterial;
  private flares = new FireTendrils(TENDRIL_ROOTS, HUMP_CENTRE);
  private geos: THREE.BufferGeometry[] = [];
  private vents: THREE.Object3D[] = [];
  private ventMats: THREE.MeshToonMaterial[] = [];
  private ventFlash: number[] = [];
  private nextVent = 0;
  private novaT = -1;
  /** Molten Fist: the strike's clock last frame (−1 when none), and its slam/backhand kind, latched at its start. */
  private meleePrevT = -1;
  private strikeKind: FistKind = 'slam';

  constructor() {
    this.bodyMat = toonMat(0xffffff, { vertexColors: true });
    this.jointMat = toonMat(C.glow, { emissive: C.glow });
    this.seamMat = toonMat(C.seam, { emissive: C.seam });
    this.coreMat = toonMat(C.coreDeep, { emissive: C.core });
    this.eyeMat = toonMat(C.eye, { emissive: C.eye });
    this.tintMats = [this.bodyMat];
    const { box, spike } = SHAPES;
    const torso: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const seam: THREE.BufferGeometry[] = [];
    const core: THREE.BufferGeometry[] = [];
    const eyes: THREE.BufferGeometry[] = [];
    const rand = rng(13);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const n = new THREE.Vector3();

    // Ribcage skin: grey hide stretched over the barrel, darker underneath.
    {
      const zs: number[] = [];
      for (let z = -55; z < CHEST_Z; z += 18) zs.push(z);
      zs.push(CHEST_Z);
      const SEG = 16;
      const v: number[] = [];
      const cols: number[] = [];
      const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (let i = 0; i + 1 < zs.length; i++) {
        for (let j = 0; j < SEG; j++) {
          const t0 = (j / SEG) * Math.PI * 2;
          const t1 = ((j + 1) / SEG) * Math.PI * 2;
          cageRaw(t0, zs[i]!, p[0]!);
          cageRaw(t0, zs[i + 1]!, p[1]!);
          cageRaw(t1, zs[i + 1]!, p[2]!);
          cageRaw(t1, zs[i]!, p[3]!);
          for (const [x, y, z] of [[0, 1, 2], [0, 2, 3]] as const) v.push(...v3(p[x]!), ...v3(p[y]!), ...v3(p[z]!));
          const c = Math.cos((t0 + t1) / 2);
          const hex = c < -0.45 ? C.skinDark : rand() < 0.12 ? C.skinLight : C.skin;
          for (let k = 0; k < 6; k++) cols.push(hex);
        }
      }
      const g = rawGeometry(v);
      const colors = new Float32Array(cols.length * 3);
      cols.forEach((hex, i) => colors.set(new THREE.Color(hex).toArray(), i * 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      torso.push(g);
    }

    // Ribs: pale bars standing proud of the skin, hellfire glowing in the slits between them.
    RIBS.forEach(([z, reach], k) => {
      for (const sx of [1, -1]) {
        let prev: THREE.Vector3 | null = null;
        for (let t = 0.3; t <= reach + 1e-6; t += (reach - 0.3) / 9) {
          const p = ribAt(z, sx * t, 9, new THREE.Vector3());
          if (prev) strut(torso, TUBE, C.boneShade, v3(prev), v3(p), 12);
          piece(torso, NUB, C.boneShade, v3(p), [24, 24, 24]);
          prev = p;
        }
        // The slit behind this rib, as long as the shorter of the two ribs either side.
        const next = RIBS[k + 1];
        const zz = next ? (z + next[0]) / 2 : z - 19;
        const end = Math.min(reach, next ? next[1] : reach - 0.3) - 0.12;
        for (let t = 0.4; t + 1e-6 < end; t += (end - 0.4) / 6) {
          const t2 = Math.min(end, t + (end - 0.4) / 6);
          ribAt(zz, sx * t, 1, a, n);
          ribAt(zz, sx * t2, 1, b);
          core.push(painted(box.clone().applyMatrix4(stripMatrix(a, b, n, 19, 6)), C.core));
        }
      }
    });
    // The chest opens on the furnace inside: a ring of rib framing a disc of hellfire, cords of sinew across it.
    {
      const zf = CHEST_Z;
      const r = cageR(zf);
      piece(core, LENS, C.core, [0, CAGE_Y, zf - 3], [CAGE_X * r * 2, 6, CAGE_H * r * 2], [Math.PI / 2, 0, 0]);
      let prev: THREE.Vector3 | null = null;
      for (let k = 0; k <= 12; k++) {
        const p = cageAt((k / 12) * Math.PI * 2, zf, 6, new THREE.Vector3());
        if (prev) strut(torso, TUBE, C.boneShade, v3(prev), v3(p), 11);
        prev = p;
      }
      for (const sx of [1, -1]) strut(torso, TUBE, C.sinew, v3(cageAt(sx * 0.5, zf, -6)), v3(cageAt(sx * 2.4, zf, -6)), 5);
    }
    // Sternum along the bottom of the cage; collarbones out to the shoulders.
    {
      let prev: THREE.Vector3 | null = null;
      for (let z = 214; z >= 60; z -= 26) {
        const p = cageAt(Math.PI, z, 6, new THREE.Vector3());
        if (prev) strut(torso, TUBE, C.boneShade, v3(prev), v3(p), 13);
        prev = p;
      }
      for (const sx of [1, -1]) strut(torso, TUBE, C.boneShade, [sx * 26, 550, 208], [sx * (SHOULDER.x - 20), SHOULDER.y + 14, SHOULDER.z + 10], 11);
    }

    // The back: a skin ridge along the spine, a sunken belly up to the pelvis, and a short bony tail.
    {
      const N = 22;
      for (let i = 0; i < N; i++) {
        const u0 = i / N;
        const u1 = (i + 1) / N;
        const r = u0 < 0.12 ? 34 : u0 < 0.35 ? 28 : u0 < 0.75 ? 34 : 28;
        strut(torso, TUBE, C.skin, v3(SPINE.getPointAt(u0)), v3(SPINE.getPointAt(u1)), r);
      }
      const belly = [new THREE.Vector3(0, CAGE_Y - 80, -20), new THREE.Vector3(0, 405, -95), new THREE.Vector3(0, 380, -150)];
      strut(torso, TUBE, C.skinDark, v3(belly[0]!), v3(belly[1]!), 34);
      strut(torso, TUBE, C.skinDark, v3(belly[1]!), v3(belly[2]!), 28);
      piece(torso, NUB, C.skinDark, v3(belly[1]!), [62, 58, 62]);
      const tail = [new THREE.Vector3(0, 360, -180), new THREE.Vector3(0, 336, -218), new THREE.Vector3(0, 306, -240)];
      for (let i = 0; i + 1 < tail.length; i++) {
        strut(torso, TUBE, C.skinDark, v3(tail[i]!), v3(tail[i + 1]!), 22 - i * 4);
        piece(torso, NUB, C.boneShade, v3(tail[i + 1]!), [34 - i * 6, 30 - i * 5, 34 - i * 6]);
      }
    }

    // Vertebrae: a ridge of knobs and backswept spines down the back, tallest over the hump; embers smoulder between.
    {
      const N = 19;
      for (let i = 0; i < N; i++) {
        const u = 0.02 + (0.95 * i) / (N - 1);
        const p = SPINE.getPointAt(u);
        const t = SPINE.getTangentAt(u);
        const lift = u < 0.35 ? 34 : u < 0.75 ? 28 : 22;
        const base = p.clone().add(_tmp.set(0, lift, 0));
        piece(torso, BALL, C.boneShade, v3(base), [44, 30, 40], [0, 0, 0]);
        const h = 26 + 62 * Math.exp(-(((u - 0.47) / 0.2) ** 2)) - (u > 0.8 ? 10 : 0);
        _dir.set(0, 1, 0).addScaledVector(t, -0.55).normalize();
        strut(torso, spike, C.bone, v3(base), v3(base.clone().addScaledVector(_dir, h)), 15);
        if (i + 1 < N) {
          const un = 0.02 + (0.95 * (i + 0.5)) / (N - 1);
          const q = SPINE.getPointAt(un).add(_tmp.set(0, lift - 4, 0));
          piece(seam, BALL, C.seam, v3(q), [30, 16, 22]);
        }
      }
      // Smouldering cracks in the hide either side of the spine.
      for (const [u, sx, len] of [[0.22, 1, 3], [0.3, -1, 4], [0.68, 1, 3], [0.4, 1, 2], [0.76, -1, 3], [0.14, -1, 3]] as const) {
        const p = SPINE.getPointAt(u).add(_tmp.set(sx * 30, 18, 0));
        for (let k = 0; k < len; k++) {
          const q = p.clone().add(_tmp.set(sx * (14 + rand() * 10), -10 - rand() * 12, (rand() - 0.5) * 34));
          _n.set(sx, 1, 0).normalize();
          seam.push(painted(box.clone().applyMatrix4(stripMatrix(p, q, _n, 9, 6)), C.seam));
          p.copy(q);
        }
      }
    }

    // Shoulder blades: sharp bony plates jutting up beside the spine, a ridge along each, shoulder knobs below.
    for (const sx of [1, -1]) {
      const top = new THREE.Vector3(sx * 50, 694, -52);
      const front = new THREE.Vector3(sx * 52, 640, 100);
      const tip = new THREE.Vector3(sx * (SHOULDER.x - 22), SHOULDER.y + 24, SHOULDER.z);
      slab(torso, C.skinLight, [top, front, tip], _n.set(sx * 0.6, 1, 0), 18);
      strut(torso, TUBE, C.boneShade, v3(tip), [sx * 64, 680, 0], 11);
      strut(torso, spike, C.bone, [sx * 64, 680, 0], [sx * 70, 752, -50], 15);
      piece(torso, NUB, C.boneShade, v3(top), [26, 26, 26]);
      piece(torso, NUB, C.skin, [sx * (SHOULDER.x - 10), SHOULDER.y + 4, SHOULDER.z], [62, 58, 62]);
      piece(torso, NUB, C.boneShade, [sx * (SHOULDER.x + 2), SHOULDER.y + 30, SHOULDER.z - 4], [38, 34, 38]);
    }

    // Pelvis: hip blades flaring out over the haunches, sit-bones behind, ball sockets either side.
    for (const sx of [1, -1]) {
      slab(torso, C.boneShade, [
        new THREE.Vector3(sx * 26, 404, -112),
        new THREE.Vector3(sx * 104, 398, -104),
        new THREE.Vector3(sx * 52, 372, -172),
      ], _n.set(sx * 0.4, 1, 0.2), 14);
      strut(torso, spike, C.boneShade, [sx * 46, 350, -170], [sx * 62, 312, -218], 14);
      piece(torso, NUB, C.skin, [sx * (HIP.x - 6), HIP.y, HIP.z], [60, 60, 60]);
      piece(glow, BALL, C.glow, [sx * (HIP.x + 14), HIP.y - 14, HIP.z + 6], [40, 30, 40]);
    }

    // Neck: a skin column under the neck vertebrae, black sinew cords beneath it.
    for (const sx of [1, -1]) strut(torso, TUBE, C.sinew, [sx * 22, 520, 190], [sx * 16, 470, 290], 9);

    // The skull: bleached, long-snouted, jaw hanging open over bared teeth; embers deep in the eye sockets.
    const head = new THREE.Matrix4().compose(HEAD_AT, _q.setFromEuler(new THREE.Euler(HEAD_PITCH, 0, 0)), _s.set(1, 1, 1));
    // In `head` space +Z runs out along the snout and +Y up over the brow.
    const hp = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(head);
    piece(torso, BALL, C.bone, [0, 4, 0], [118, 100, 124], [0, 0, 0], head);
    piece(torso, BALL, C.boneShade, [0, 10, -50], [86, 76, 54], [0, 0, 0], head);
    piece(torso, BALL, C.bone, [0, 34, 34], [96, 34, 70], [0, 0, 0], head);
    piece(torso, SNOUT, C.bone, [0, -6, 128], [90, 200, 70], [Math.PI / 2, 0, 0], head);
    piece(torso, box, C.boneShade, [0, 16, 118], [34, 10, 150], [0.06, 0, 0], head);
    // Nasal cavity and the dark of the mouth under the upper jaw.
    piece(torso, box, C.socket, [0, 18, 196], [20, 8, 34], [0, 0, 0], head);
    piece(torso, box, C.socket, [0, -30, 120], [46, 14, 150], [0, 0, 0], head);
    for (let i = 0; i < 5; i++) {
      for (const sx of [1, -1]) {
        const z = 64 + i * 30;
        const x = sx * (30 - i * 4.5);
        strut(torso, spike, C.bone, v3(hp(x, -26, z)), v3(hp(x, -50, z + 4)), 7);
      }
    }
    // The lower jaw: two thin bars hinged under the skull, hanging open, teeth along them.
    for (const sx of [1, -1]) {
      const j0 = hp(sx * 40, -30, -10);
      const j1 = hp(sx * 30, -78, 100);
      const j2 = hp(sx * 14, -84, 190);
      strut(torso, TUBE, C.boneShade, v3(j0), v3(j1), 12);
      strut(torso, TUBE, C.boneShade, v3(j1), v3(j2), 9);
      piece(torso, NUB, C.boneShade, v3(j1), [24, 24, 24]);
      for (let i = 0; i < 4; i++) {
        _at.lerpVectors(j1, j2, 0.1 + i * 0.27);
        strut(torso, spike, C.bone, v3(_at), v3(_at.clone().add(hp(0, 22, 0).sub(HEAD_AT))), 6);
      }
    }
    // Eye sockets: deep black hollows with an ember burning in each.
    for (const sx of [1, -1]) {
      piece(torso, BALL, C.socket, [sx * 40, 16, 38], [50, 46, 50], [0, 0, 0], head);
      piece(torso, NUB, C.bone, [sx * 46, 42, 40], [44, 16, 46], [0, 0, 0], head);
      piece(eyes, BALL, C.eye, [sx * 52, 14, 48], [30, 26, 30], [0, 0, 0], head);
    }

    // Antlers: a great jagged rack, the beams sweeping up and out from the crown, tines hooking forward and up.
    for (const sx of [1, -1]) {
      const root = hp(sx * 34, 50, -14);
      const X = (x: number, y: number, z: number) => root.clone().add(_tmp.set(sx * x, y, z));
      const beam = [X(0, 0, 0), X(50, 58, -18), X(112, 124, -40), X(168, 206, -34), X(204, 290, -6), X(214, 360, 36)];
      piece(torso, LENS, C.boneShade, v3(beam[0]!), [52, 18, 52], [0, 0, sx * -0.6]);
      branch(torso, C.antler, beam, 21, 12);
      // Brow tine hooking forward over the face, then tines off the beam: forward-up, outward, back, and a top fork.
      branch(torso, C.antler, [beam[1]!, X(78, 92, 48), X(84, 104, 120)], 13, 9);
      branch(torso, C.antler, [beam[2]!, X(128, 200, 22), X(120, 262, 72)], 13, 9);
      branch(torso, C.antler, [beam[3]!, X(258, 262, -16), X(300, 330, 4)], 13, 9);
      branch(torso, C.antler, [beam[3]!, X(150, 272, -112), X(164, 338, -146)], 12, 8);
      branch(torso, C.antler, [beam[4]!, X(272, 352, -30), X(296, 420, -40)], 12, 8);
      branch(torso, C.antler, [beam[4]!, X(190, 372, 72), X(178, 418, 118)], 11, 8);
      // Jagged little spurs along the beams.
      for (const [i, dx, dy, dz] of [[1, 20, 30, 30], [2, -24, 30, 20], [4, 30, 14, -26]] as const) {
        const p = beam[i]!.clone().lerp(beam[i + 1]!, 0.5);
        strut(torso, spike, C.antler, v3(p), v3(p.clone().add(_tmp.set(sx * dx, dy, dz))), 9);
      }
    }

    // Tattered strips of dark hide hanging off the waist behind the ribs and off the haunches.
    for (const [x, y, z, len, w] of [
      [92, 500, -48, 120, 44], [96, 420, -116, 90, 40],
    ] as const) {
      for (const sx of [1, -1]) {
        const swing = (rand() - 0.5) * 30;
        const out = sx * (18 + rand() * 10);
        const p0 = new THREE.Vector3(sx * x, y, z - w / 2);
        const p1 = new THREE.Vector3(sx * x, y, z + w / 2);
        const p2 = new THREE.Vector3(sx * x + out, y - len * 0.8, z + w * 0.35 + swing);
        const p3 = new THREE.Vector3(sx * x + out, y - len, z + swing * 0.5);
        const p4 = new THREE.Vector3(sx * x + out, y - len * 0.72, z - w * 0.4 + swing);
        slab(torso, C.hide, [p0, p1, p2, p3, p4], _n.set(sx, 0, 0), 5);
      }
    }

    // Magma Lob wounds: two burning holes behind the shoulder blades and one on the lumbar spine; `mouth` is where shots leave.
    const throat = this.keep(new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2));
    const wounds: { at: THREE.Vector3; n: THREE.Vector3 }[] = [];
    for (const sx of [1, -1]) {
      const wn = new THREE.Vector3();
      wounds.push({ at: cageAt(sx * 0.62, -2, 2, new THREE.Vector3(), wn), n: wn });
    }
    wounds.push({ at: SPINE.getPointAt(0.12).add(new THREE.Vector3(0, 34, 0)), n: new THREE.Vector3(0, 1, -0.35).normalize() });
    for (const { at, n: wn } of wounds) {
      const vent = new THREE.Object3D();
      along(at, wn).decompose(vent.position, vent.quaternion, vent.scale);
      vent.updateMatrix();
      for (let k = 0; k < 6; k++) {
        const ang = k * 1.05 + rand() * 0.4;
        piece(torso, NUB, k % 2 ? C.sinew : C.skinDark, [Math.sin(ang) * 30, 4, Math.cos(ang) * 30], [26, 16, 26], [rand(), rand(), 0], vent.matrix);
      }
      const mat = toonMat(C.magma, { emissive: C.magma });
      this.ventMats.push(mat);
      this.ventFlash.push(0);
      this.mesh(vent, throat, mat, false).position.set(0, 8, 0);
      vent.children[0]!.scale.set(26, 1, 26);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 50, 0);
      vent.add(mouth);
      this.vents.push(mouth);
      this.shell.add(vent);
    }
    // Embers at the tendril roots.
    for (const r of TENDRIL_ROOTS) piece(glow, BALL, C.glow, v3(r), [30, 20, 30]);

    // The torso casts shadows but takes none: the antlers and spine would otherwise drown the ribcage in shade.
    this.mesh(this.shell, this.keep(merge(torso)), this.bodyMat).receiveShadow = false;
    this.mesh(this.shell, this.keep(merge(glow)), this.jointMat, false);
    this.mesh(this.shell, this.keep(merge(seam)), this.seamMat, false);
    this.mesh(this.shell, this.keep(merge(core)), this.coreMat, false);
    this.mesh(this.shell, this.keep(merge(eyes)), this.eyeMat, false);

    this.shell.position.copy(PIVOT).multiplyScalar(-1);
    this.body.add(this.shell);
    this.root.add(this.body);

    // Limbs (root space; placed by IK every frame). Limb space: Y runs from the joint nearer the body (−len/2) to
    // the far one (+len/2); +Z is the IK bend side. Embers glow in a crack at each joint.
    const limb = (build: (parts: THREE.BufferGeometry[], glow: THREE.BufferGeometry[]) => void, len: number) => {
      const parts: THREE.BufferGeometry[] = [];
      const gp: THREE.BufferGeometry[] = [];
      build(parts, gp);
      const m = this.mesh(this.root, this.keep(merge(parts).scale(1, 1 / len, 1)), this.bodyMat);
      if (gp.length) this.mesh(m, this.keep(merge(gp).scale(1, 1 / len, 1)), this.jointMat, false);
      return m;
    };
    const upperGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      const L = UPPER / 2;
      piece(p, SHAPES.limb, C.skin, [0, 0, 0], [38, UPPER - 20, 38]);
      piece(p, NUB, C.skinDark, [0, -L + 76, -4], [60, 120, 54]);
      piece(p, box, C.sinew, [0, 6, -20], [12, UPPER * 0.66, 10]);
      // A knobbed elbow with a bony point jutting back.
      piece(p, BALL, C.boneShade, [0, L - 4, 0], [52, 50, 52]);
      strut(p, spike, C.bone, [0, L - 12, 14], [0, L + 22, 66], 13);
      crack(g, -L + 20, 21, 0.4, 70);
      crack(g, L - 64, 18, Math.PI + 0.3, 56);
    };
    const foreGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      const L = FORE / 2;
      // Two bones under taut skin, a sinew cord between, a knobbed wrist.
      piece(p, TUBE, C.skin, [7, 0, 0], [34, FORE - 10, 34]);
      piece(p, TUBE, C.skinLight, [-12, 4, -6], [22, FORE - 50, 22]);
      piece(p, box, C.sinew, [0, -6, 17], [10, FORE * 0.6, 8]);
      piece(p, BALL, C.boneShade, [0, L - 8, 0], [44, 40, 44]);
      crack(g, -L + 14, 18, -0.6, 60);
      crack(g, L - 70, 17, Math.PI - 0.4, 54);
    };
    const handGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      // Root-aligned, centred on the palm FIST_R above the ground: four long needle fingers arching up then down to
      // black claws, splayed forward, and a hooked thumb-claw behind.
      piece(p, BALL, C.skinDark, [0, 2, 8], [70, 38, 80]);
      for (const ang of [-0.6, -0.2, 0.2, 0.6]) {
        const s = Math.sin(ang);
        const c = Math.cos(ang);
        const k: V3 = [s * 26, 4, c * 36];
        const j1: V3 = [s * 72, 40, c * 96];
        const j2: V3 = [s * 112, -10, c * 152];
        const tip: V3 = [s * 128, -FIST_R + 2, c * 186];
        strut(p, TUBE, C.skin, k, j1, 11);
        piece(p, NUB, C.boneShade, j1, [26, 26, 26]);
        strut(p, TUBE, C.skinLight, j1, j2, 9);
        piece(p, NUB, C.boneShade, j2, [20, 20, 20]);
        strut(p, spike, C.horn, j2, tip, 11);
        piece(g, BALL, C.glow, k, [18, 18, 18]);
      }
      strut(p, TUBE, C.skin, [0, -6, -24], [0, -34, -62], 10);
      strut(p, spike, C.horn, [0, -34, -62], [0, -FIST_R + 2, -92], 11);
    };
    const thighGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      const L = THIGH / 2;
      // A lean, wasted haunch; the knee knob forward.
      piece(p, NUB, C.skin, [0, -14, 0], [74, THIGH + 10, 66]);
      piece(p, box, C.sinew, [0, 0, -26], [12, THIGH * 0.6, 10]);
      piece(p, BALL, C.boneShade, [0, L - 2, 6], [46, 44, 46]);
      crack(g, L - 60, 30, 0.3, 50);
    };
    const shinGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      const L = SHIN / 2;
      // A thin bone back to the hock, its tendon cord behind; a bony hock point.
      piece(p, TUBE, C.skin, [0, 0, 0], [32, SHIN, 32]);
      piece(p, box, C.sinew, [0, 10, -20], [12, SHIN * 0.8, 10]);
      piece(p, BALL, C.boneShade, [0, L - 2, -4], [40, 40, 40]);
      strut(p, spike, C.bone, [0, L - 4, -14], [0, L + 10, -48], 10);
      crack(g, -L + 8, 16, 2.6, 50);
    };
    const footGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      // Root-aligned on the hoof's ground point: the cannon bone from the hock down to a cloven black hoof.
      const fet: V3 = [0, 34, 6];
      strut(p, TUBE, C.skin, [HOCK.x, HOCK.y, HOCK.z], fet, 14);
      piece(p, NUB, C.boneShade, fet, [32, 30, 32]);
      strut(p, TUBE, C.skinDark, fet, [0, 16, 22], 12);
      for (const sx of [1, -1]) piece(p, TRI, C.horn, [sx * 13, 13, 30], [28, 26, 58], [0, sx * 0.08, 0]);
      for (const sx of [1, -1]) strut(p, spike, C.horn, [sx * 10, 36, -6], [sx * 14, 10, -24], 6);
      piece(g, NUB, C.glow, [HOCK.x, HOCK.y - 4, HOCK.z - 14], [20, 22, 16]);
    };
    for (let i = 0; i < 2; i++) {
      this.limbArms.push({ upper: limb(upperGeo, UPPER), fore: limb(foreGeo, FORE), fist: limb(handGeo, 1) });
      this.legs.push({ thigh: limb(thighGeo, THIGH), shin: limb(shinGeo, SHIN), foot: limb(footGeo, 1) });
    }

    // Spectral fire tendrils rising off the spine; Vent Burst whips one at a flyer.
    this.root.add(this.flares.mesh);
  }

  private mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    parent.add(m);
    return m;
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  /** Eruption: both hands rise and slam the ground. */
  nova(): void {
    this.novaT = 0;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const m = f.motion;
    const S = G.stats.strideLength;
    // Half the distance a planted limb slides back during stance, so it stays still on the ground.
    const A = ((1 - SWING) * S) / 2;
    if (this.novaT >= 0) {
      this.novaT += f.dt;
      if (this.novaT >= NOVA_TIME) this.novaT = -1;
    }
    const nova = this.novaT >= 0 ? this.novaT / NOVA_TIME : -1;
    const slam = nova >= 0 ? Math.sin(Math.PI * nova) : 0;

    // Molten Fist: slam or backhand is decided once, as the strike starts; the body lunges toward the strike.
    let lean = 0;
    let leanA = 0;
    _lunge.set(0, 0, 0);
    if (f.melee) {
      this.root.updateMatrixWorld();
      this.root.worldToLocal(_aim.copy(f.melee.target));
      _aim.y = FIST_R;
      if (strikeStarted(this.meleePrevT, f.melee.t)) this.strikeKind = fistKind(Math.atan2(_aim.x, _aim.z), G.fist.frontHalf);
      this.meleePrevT = f.melee.t;
      // A slam lunges at the target; a backhand toward the end of its sweep, so the sweep ends at the target's distance.
      const from = this.strikeKind === 'slam' ? LUNGE_FROM : BACKHAND_R;
      const k = (lungeAmount(Math.hypot(_aim.x, _aim.z), from, LUNGE_MAX) / LUNGE_MAX) * lungeWeight(f.melee.t, G.stats.meleeTiming, STRIKE_HOLD);
      leanA = this.strikeKind === 'slam' ? Math.atan2(_aim.x, _aim.z) : (f.melee.side === 0 ? 1 : -1) * G.fist.backhandCenter;
      _lunge.set(Math.sin(leanA) * LUNGE_MAX * k, -LUNGE_DROP * k, Math.cos(leanA) * LUNGE_MAX * k);
      lean = LUNGE_LEAN * k;
    } else this.meleePrevT = -1;

    // The shoulders roll toward the planting hand; the body bobs twice a cycle and breathes when still.
    const roll = Math.sin(f.cycle * Math.PI * 2) * 0.07 * m;
    const bob = Math.cos(f.cycle * Math.PI * 4) * 10 * m + Math.sin(f.time * 1.1) * 6;
    this.body.position.set(PIVOT.x, PIVOT.y + bob - f.pose.dip - slam * 40 - f.pose.collapse * 230, PIVOT.z).add(_lunge);
    // Leaning toward bearing leanA: +X rotation tips the shoulders forward (+Z), −Z rotation toward the left (+X).
    this.body.rotation.set(
      f.pose.pitch + (f.roaring ? -0.55 : 0) + (f.dashing ? 0.25 : 0) + slam * 0.25 + f.pose.collapse * 0.4 + Math.cos(leanA) * lean,
      0,
      roll - f.pose.collapse * 0.15 - Math.sin(leanA) * lean,
    );
    this.root.updateMatrixWorld(true);
    _rel.multiplyMatrices(this.body.matrix, this.shell.matrix);

    // Arms: creep on the hands, or strike, slam (Eruption), claw at the sky (Roar), reach down (Leap).
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const limb = side === 0 ? 0 : 2;
      const arm = this.limbArms[side]!;
      const g = limbSwing(f.cycle, limb);
      _gait.set(FIST_AT.x * sx, FIST_AT.y + g.lift * FIST_LIFT * m, FIST_AT.z + g.stride * A * m);
      _fist.copy(_gait);
      const striking = f.melee !== null && f.melee.side === side;
      if (striking) this.strikePose(f.melee!.t, sx, _gait, _fist);
      if (nova >= 0) {
        // Rise, slam down by 0.65, then ease back to the gait pose.
        mirror(SLAM_RAISE, sx, _raise);
        _end.set(sx * 280, FIST_R, 320);
        if (nova < 0.5) _fist.lerpVectors(_gait, _raise, nova / 0.5);
        else if (nova < 0.65) _fist.lerpVectors(_raise, _end, (nova - 0.5) / 0.15);
        else {
          const u = (nova - 0.65) / 0.35;
          _fist.lerpVectors(_end, _gait, u * u * (3 - 2 * u));
        }
      }
      if (f.roaring) _fist.set(sx * 90, 430 + Math.sin(f.time * 14 + side * Math.PI) * 45, 250);
      if (f.airborne) _fist.set(sx * 230, -30, 260);
      mirror(SHOULDER, sx, _sh).applyMatrix4(_rel);
      _tmp.subVectors(_fist, _sh);
      if (_tmp.length() > ARM_REACH) _fist.copy(_sh).add(_tmp.setLength(ARM_REACH));
      _pole.copy(_sh).add(_ref.set(sx * 260, -40, -260)); // elbows out and back
      solveTwoBone(_sh, _fist, UPPER, FORE, _pole, _elbow);
      placeLimb(arm.upper, _sh, _elbow, _ref);
      placeLimb(arm.fore, _elbow, _fist, _ref);
      arm.fist.position.copy(_fist);
      if (m > 0.3 && !striking && nova < 0 && limbPlanted(f.prevCycle, f.cycle, limb)) {
        onFootLand(_world.copy(_gait).setY(0).applyMatrix4(this.root.matrixWorld));
      }
    }

    // Hind legs: digitigrade, knees forward and hocks back; the IK runs hip to hock, the cannon bone rides the hoof.
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const limb = side === 0 ? 3 : 1;
      const leg = this.legs[side]!;
      const g = limbSwing(f.cycle, limb);
      _foot.set(FOOT_AT.x * sx, g.lift * FOOT_LIFT * m, FOOT_AT.z + g.stride * A * m);
      if (f.airborne) _foot.set(sx * 150, 60, -60);
      _hock.copy(_foot).add(HOCK);
      mirror(HIP, sx, _hip).applyMatrix4(_rel);
      _pole.copy(_hip).add(_ref.set(sx * 30, 0, 300));
      solveTwoBone(_hip, _hock, THIGH, SHIN, _pole, _knee);
      placeLimb(leg.thigh, _hip, _knee, _ref);
      placeLimb(leg.shin, _knee, _hock, _ref);
      leg.foot.position.copy(_foot);
      if (m > 0.3 && limbPlanted(f.prevCycle, f.cycle, limb)) onFootLand(_world.copy(_foot).setY(0).applyMatrix4(this.root.matrixWorld));
    }

    // Fire tendrils: spectral flames off the spine; for Vent Burst the nearest one cocks back and cracks onto the flyer.
    const lashAt = f.antiAir ? this.root.worldToLocal(_aim.copy(f.antiAir.target)) : null;
    const hot = Math.max(f.heat, f.roaring ? 1 : 0);
    this.flares.update(f.dt, f.time, _rel, this.root.matrixWorld, lashAt, f.antiAir ? Math.min(1, f.antiAir.weight) : 0, hot, f.pose.collapse);

    // Glow: joints, spine cracks, ribcage fire and eyes flicker at rest and blaze with Molten Core heat.
    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    const pulse = 0.25 * Math.sin(f.time * 2.2);
    const flicker = 0.14 * Math.sin(f.time * 13.1) + 0.1 * Math.sin(f.time * 7.3 + 1);
    this.jointMat.emissiveIntensity = f.flash ? 3 : 0.8 + pulse + flicker + f.heat * 2.2 + (f.roaring ? 1.5 : 0);
    this.seamMat.emissiveIntensity = f.flash ? 2 : 0.7 + pulse * 0.6 + flicker + f.heat * 2.4 + (f.roaring ? 1 : 0);
    this.coreMat.emissiveIntensity = f.flash ? 3 : 1 + pulse + flicker * 1.5 + f.heat * 3.2 + (f.roaring ? 1 : 0);
    this.eyeMat.emissiveIntensity = 1.2 + flicker + f.heat * 2 + (f.roaring ? 2 : 0);
    for (let i = 0; i < this.ventMats.length; i++) {
      this.ventFlash[i] = Math.max(0, this.ventFlash[i]! - f.dt * 5);
      this.ventMats[i]!.emissiveIntensity = f.flash ? 3 : 0.8 + f.heat + 3 * this.ventFlash[i]!;
    }
  }

  /**
   * Molten Fist (root space; `_aim` holds the target and `_lunge` the body's lunge). Slam: rise, then drop onto the
   * target. Backhand: cock across the chest, then sweep out along an arc around the lunging body to the target's
   * side. Both hold on the target for STRIKE_HOLD, then ease back to the gait position. The kind is the one latched
   * at the strike's start.
   */
  private strikePose(t: number, sx: number, gait: THREE.Vector3, out: THREE.Vector3): void {
    const T = G.stats.meleeTiming;
    if (this.strikeKind === 'slam') {
      mirror(SLAM_RAISE, sx, _raise);
      if (t < T.windup) out.lerpVectors(gait, _raise, t / T.windup);
      else if (t < T.impact) {
        const u = (t - T.windup) / (T.impact - T.windup);
        out.lerpVectors(_raise, _aim, u * u);
      } else out.lerpVectors(_aim, gait, strikeReturn(t, T, STRIKE_HOLD));
      return;
    }
    mirror(BACKHAND_COCK, sx, _raise);
    const a0 = Math.atan2(_raise.x, _raise.z);
    const r0 = Math.hypot(_raise.x, _raise.z);
    const a1 = sx * G.fist.backhandCenter;
    _end.set(Math.sin(a1) * BACKHAND_R + _lunge.x, FIST_R + 30, Math.cos(a1) * BACKHAND_R + _lunge.z);
    if (t < T.windup) out.lerpVectors(gait, _raise, t / T.windup);
    else if (t < T.impact) {
      const u = (t - T.windup) / (T.impact - T.windup);
      const a = a0 + (a1 - a0) * u;
      const r = r0 + (BACKHAND_R - r0) * u;
      out.set(Math.sin(a) * r + _lunge.x, _raise.y + (_end.y - _raise.y) * u, Math.cos(a) * r + _lunge.z);
    } else out.lerpVectors(_end, gait, strikeReturn(t, T, STRIKE_HOLD));
  }

  /** Shots leave from the back wounds in turn; the one used flares. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    const i = this.nextVent++ % this.vents.length;
    this.ventFlash[i] = 1;
    const v = this.vents[i]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  /** The first back wound. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    const v = this.vents[0]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  aimError(): number {
    return 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.flares.dispose();
  }
}
