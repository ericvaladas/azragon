import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
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
/** Hand size: the fingers' spread and reach about the palm (1 = the original long-fingered hand). */
const HAND = 0.68;
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


/** The spine (torso space): from the sacrum up over the high hunched withers above the shoulders, down to the neck. */
const SPINE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 360, -180),
  new THREE.Vector3(0, 455, -115),
  new THREE.Vector3(0, 570, -35),
  new THREE.Vector3(0, 640, 55),
  new THREE.Vector3(0, 618, 150),
  new THREE.Vector3(0, 560, 228),
  new THREE.Vector3(0, 528, 272),
]);
/** The neck (torso space): on from the end of the spine, long, low and thrust forward to the back of the skull. */
const NECK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 528, 272),
  new THREE.Vector3(0, 512, 316),
  new THREE.Vector3(0, 494, 354),
  new THREE.Vector3(0, 480, 386),
]);

/**
 * The trunk (torso space): a narrow, deep-chested barrel along z under the spine. Its cross-section at z is an
 * ellipse of half-width CAGE_X·r(z) and half-height CAGE_H·r(z) about y = CAGE_Y; `theta` runs around it (0 = top,
 * π/2 = left).
 */
const CAGE_Y = 458;
const CAGE_X = 104;
const CAGE_H = 162;
const CAGE_Z: readonly (readonly [number, number])[] = [
  [-55, 0.15], [-35, 0.5], [-5, 0.8], [40, 0.96], [90, 1], [140, 0.95], [180, 0.84], [215, 0.64], [240, 0.4], [255, 0.12],
];
/** Ribs under the skin: the z where each leaves the spine, and how far round (theta) it reaches; the back ones float short. */
const RIBS: readonly (readonly [number, number])[] = [[178, 2.6], [146, 2.6], [114, 2.5], [82, 2.35], [50, 2.15], [18, 1.9], [-12, 1.6]];
/** How far (z) a rib slants back between the spine and the bottom of the trunk. */
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

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** How far round the trunk (|theta|) the fur coat reaches at z: low on the flanks over the shoulders, higher behind. */
function coatReach(z: number): number {
  return z < 60 ? 1.15 : 1.35;
}

/** How far (model units) the ribs push the skin out at (theta, z): low ridges on the flanks, fading toward spine and belly. */
function ribBump(theta: number, z: number): number {
  const t = Math.abs(theta);
  let b = 0;
  for (const [zr, reach] of RIBS) {
    const fade = smooth(0.45, 0.85, t) * (1 - smooth(reach - 0.45, reach, t));
    if (fade <= 0) continue;
    const d = (z - (zr - RIB_SLANT * (t / Math.PI))) / 7;
    b = Math.max(b, 6 * fade * Math.exp(-d * d));
  }
  return b;
}

function cageRaw(theta: number, z: number, out: THREE.Vector3, bump = 0): THREE.Vector3 {
  const r = cageR(z);
  const k = 1 + bump / 100;
  return out.set(Math.sin(theta) * CAGE_X * r * k, CAGE_Y + Math.cos(theta) * CAGE_H * r * k, z);
}

const _ea = new THREE.Vector3();
const _eb = new THREE.Vector3();
const _ec = new THREE.Vector3();
/** The point at (theta, z) on the trunk's skin, lifted `lift` along its outward normal (written to `nrm` when given). */
function cageAt(theta: number, z: number, lift = 0, out = new THREE.Vector3(), nrm?: THREE.Vector3): THREE.Vector3 {
  cageRaw(theta + 0.01, z, _ea).sub(cageRaw(theta - 0.01, z, _eb));
  cageRaw(theta, z + 0.5, _eb).sub(cageRaw(theta, z - 0.5, _ec));
  _ec.crossVectors(_eb, _ea).normalize();
  cageRaw(theta, z, out);
  if (_ec.x * out.x + _ec.y * (out.y - CAGE_Y) < 0) _ec.negate();
  if (nrm) nrm.copy(_ec);
  return out.addScaledVector(_ec, lift);
}

/** Shadow tendrils rise from the spine away from this point (torso space): deep in the trunk. */
const HUMP_CENTRE = new THREE.Vector3(0, CAGE_Y - 40, 60);
/** Shadow tendrils (torso space): two pairs either side of the spine, between the shoulders, under the mane. */
const TENDRIL_ROOTS: readonly THREE.Vector3[] = [0.5, 0.6].flatMap((u) => {
  const p = SPINE.getPointAt(u);
  return [1, -1].map((sx) => p.clone().add(new THREE.Vector3(sx * 30, 14, 0)));
});
/** The skull (torso space): hung low and forward at the end of the neck, the snout pitched down HEAD_PITCH rad. */
const HEAD_AT = new THREE.Vector3(0, 472, 408);
const HEAD_PITCH = 0.62;
/** Scale of the antler rack's layout. */
const RACK = 1.25;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _down = new THREE.Vector3(0, -1, 0);
const _s = new THREE.Vector3();
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
const _ca = new THREE.Color();
const _cb = new THREE.Color();

/** Extra unit shapes: an eight-sided tube, a snout tapering toward +Y, and a triangular prism. */
const TUBE = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
const SNOUT = faceted(new THREE.CylinderGeometry(0.3, 0.5, 1, 7));
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

/**
 * A clump of matted fur: a flattened four-sided shard `len` long and `r` wide, leaving `base` along `dir`, shaded
 * from `root` at the base to `tip` at the point (the tips catch the light so the mane keeps its shape in daylight).
 */
function shard(out: THREE.BufferGeometry[], base: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, root: number, tip: number, spin = 0): void {
  const g = SHAPES.spike.clone();
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  _ca.setHex(root);
  _cb.setHex(tip);
  for (let i = 0; i < pos.count; i++) {
    const u = Math.min(1, Math.max(0, pos.getY(i) + 0.5));
    _tmp.set(_ca.r + (_cb.r - _ca.r) * u, _ca.g + (_cb.g - _ca.g) * u, _ca.b + (_cb.b - _ca.b) * u);
    col.set([_tmp.x, _tmp.y, _tmp.z], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  _dir.copy(dir).normalize();
  along(_at.copy(base).addScaledVector(_dir, len / 2), _dir, spin, _m);
  g.applyMatrix4(_m.multiply(new THREE.Matrix4().makeScale(r * 2, len, r * 1.2)));
  out.push(g);
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
 * A gnarled, tapering antler tine through `pts`: radius r0 at the first point to r1 at the last, knotted at each
 * bend, ending in a worn point of colour `tip`.
 */
function branch(out: THREE.BufferGeometry[], color: number, tip: number, pts: readonly THREE.Vector3[], r0: number, r1: number): void {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const r = r0 + ((r1 - r0) * i) / n;
    const last = i === n - 1;
    strut(out, last ? SHAPES.spike : TUBE, last ? tip : color, v3(pts[i]!), v3(pts[i + 1]!), last ? r * 1.2 : r);
    if (!last) piece(out, NUB, color, v3(pts[i + 1]!), [r * 2.4, r * 2.4, r * 2.4]);
  }
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
 * The Magma Golem, built as a wendigo of the northern woods: a gaunt, starved thing that stalks on very long,
 * sinewy arms and bony, clawed hands. Tight olive-grey skin shows the ribs and the knuckled lower spine beneath it;
 * a ragged black mane of matted fur hangs off its hunched withers, neck, shoulders and chest. Its face is a
 * weathered deer skull with empty sockets, carried low and forward on a long neck under a small gnarled rack hung
 * with moss. Digitigrade hind legs on cloven hooves. Shadowy tendrils of smoke writhe off its back and whip at
 * flyers; Magma Lob shots leave from hidden points on its back. Faces +Z; +X is its left.
 */
export class GolemBody implements MonsterBody {
  readonly root = new THREE.Group();
  /** Pivots at PIVOT; `shell` (offset by −PIVOT) holds the torso parts in root-like coordinates. */
  private body = new THREE.Group();
  private shell = new THREE.Group();
  /** Named `limbArms`: `arms` is MonsterBody's optional tentacle hook (the 4b Kaiju collision). */
  private limbArms: Arm[] = [];
  private legs: Leg[] = [];
  /** One matte, vertex-coloured toon material for the whole body; its emissive only carries the hit flash and level-up glow. */
  private bodyMat: THREE.MeshToonMaterial;
  private flares = new FireTendrils(TENDRIL_ROOTS, HUMP_CENTRE);
  private geos: THREE.BufferGeometry[] = [];
  private vents: THREE.Object3D[] = [];
  private nextVent = 0;
  private novaT = -1;
  /** Molten Fist: the strike's clock last frame (−1 when none), and its slam/backhand kind, latched at its start. */
  private meleePrevT = -1;
  private strikeKind: FistKind = 'slam';

  constructor() {
    this.bodyMat = toonMat(0xffffff, { vertexColors: true });
    const { box, spike } = SHAPES;
    const torso: THREE.BufferGeometry[] = [];
    const rand = rng(13);
    const jit = (s: number) => (rand() - 0.5) * 2 * s;
    const n = new THREE.Vector3();
    const p = new THREE.Vector3();
    /** Fur colours: mostly near-black or umber at the root; the tips lighter, some only a little. */
    const furRoot = () => (rand() < 0.55 ? C.furDark : C.fur);
    const furTip = () => (rand() < 0.65 ? C.furTip : C.fur);

    // The trunk: olive-grey skin stretched tight over the ribs, ridges catching the light, darker underneath.
    {
      const zs: number[] = [];
      for (let z = -55; z < 255; z += 6) zs.push(z);
      zs.push(255);
      const SEG = 20;
      const v: number[] = [];
      const cols: number[] = [];
      const q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const ring = (z: number, j: number, out: THREE.Vector3) => {
        const t = (j / SEG) * Math.PI * 2;
        return cageRaw(t, z, out, ribBump(t > Math.PI ? t - Math.PI * 2 : t, z));
      };
      const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hex: number) => {
        v.push(...v3(a), ...v3(b), ...v3(c));
        for (let k = 0; k < 3; k++) cols.push(hex);
      };
      for (let i = 0; i + 1 < zs.length; i++) {
        for (let j = 0; j < SEG; j++) {
          ring(zs[i]!, j, q[0]!);
          ring(zs[i + 1]!, j, q[1]!);
          ring(zs[i + 1]!, j + 1, q[2]!);
          ring(zs[i]!, j + 1, q[3]!);
          const t = ((j + 0.5) / SEG) * Math.PI * 2;
          const b = ribBump(t > Math.PI ? t - Math.PI * 2 : t, (zs[i]! + zs[i + 1]!) / 2);
          const zc = (zs[i]! + zs[i + 1]!) / 2;
          const th = Math.abs(t > Math.PI ? t - Math.PI * 2 : t);
          // Under the coat the skin is dark, so no olive shows between the clumps.
          const hex = th < coatReach(zc) - 0.2 || zc < -40 ? C.furDark : b > 3 ? C.skinLight : Math.cos(t) < -0.45 ? C.skinDark : C.skin;
          face(q[0]!, q[1]!, q[2]!, hex);
          face(q[0]!, q[2]!, q[3]!, hex);
        }
      }
      // Close both ends.
      for (const [z, cz, flip] of [[-55, -62, true], [255, 262, false]] as const) {
        const c = new THREE.Vector3(0, CAGE_Y, cz);
        for (let j = 0; j < SEG; j++) {
          ring(z, j, q[0]!);
          ring(z, j + 1, q[1]!);
          if (flip) face(c, q[1]!, q[0]!, C.skinDark);
          else face(c, q[0]!, q[1]!, C.skinDark);
        }
      }
      const g = rawGeometry(v);
      const colors = new Float32Array(cols.length * 3);
      cols.forEach((hex, i) => colors.set(new THREE.Color(hex).toArray(), i * 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      torso.push(g);
    }

    // The back: a skin ridge along the spine and a sunken belly up to the pelvis.
    {
      const N = 22;
      for (let i = 0; i < N; i++) {
        const u0 = i / N;
        const u1 = (i + 1) / N;
        const r = u0 < 0.12 ? 30 : u0 < 0.35 ? 26 : 32;
        strut(torso, TUBE, C.furDark, v3(SPINE.getPointAt(u0)), v3(SPINE.getPointAt(u1)), r);
      }
      const belly = [new THREE.Vector3(0, CAGE_Y - 80, -20), new THREE.Vector3(0, 405, -95), new THREE.Vector3(0, 380, -150)];
      strut(torso, TUBE, C.skinDark, v3(belly[0]!), v3(belly[1]!), 30);
      strut(torso, TUBE, C.skinDark, v3(belly[1]!), v3(belly[2]!), 26);
      piece(torso, NUB, C.skinDark, v3(belly[1]!), [56, 52, 56]);
    }

    // Pelvis: hip bones jutting under the skin over the haunches; the hip joints either side.
    for (const sx of [1, -1]) {
      piece(torso, NUB, C.skinLight, [sx * 76, 396, -108], [34, 22, 30]);
      piece(torso, NUB, C.skin, [sx * (HIP.x - 6), HIP.y, HIP.z], [54, 54, 54]);
    }

    // Shoulders: the joints the arms hang from, grown out of the trunk by a scapula and deltoid mass over the top,
    // a pectoral below and a sinew cord under that; the mane drapes over the join.
    for (const sx of [1, -1]) {
      const sh: V3 = [sx * (SHOULDER.x - 10), SHOULDER.y + 4, SHOULDER.z];
      piece(torso, NUB, C.skinDark, sh, [62, 58, 62]);
      piece(torso, NUB, C.skinDark, [sx * 78, 548, 70], [84, 62, 84], [0.3, 0.5, 0]);
      piece(torso, NUB, C.skinDark, [sx * 132, 526, 76], [90, 66, 86], [0.2, 1.1, 0.3]);
      piece(torso, NUB, C.skinDark, [sx * 140, 470, 112], [76, 58, 72], [0.4, 0.8, 0]);
      piece(torso, NUB, C.skinDark, [sx * 92, 478, 150], [70, 56, 70], [0.1, 0.3, 0.5]);
      strut(torso, TUBE, C.sinew, [sx * 64, 440, 140], [sx * (SHOULDER.x - 12), SHOULDER.y - 24, SHOULDER.z + 4], 8);
      for (let k = 0; k < 18; k++) {
        const u = (k % 9) / 8;
        p.set(sx * (64 + (SHOULDER.x - 74) * u), 566 - 50 * u + jit(6), (k < 9 ? 60 : 110) + jit(22));
        _dir.set(sx * (0.35 + 0.3 * u), -1, -0.3 + jit(0.3));
        shard(torso, p, _dir, 60 + rand() * 40, 16 + rand() * 6, furRoot(), furTip(), rand() * 3);
      }
    }

    // Neck: a lean column along NECK (all under the mane), black sinew cords under it.
    {
      const N = 6;
      for (let i = 0; i < N; i++) strut(torso, TUBE, C.furDark, v3(NECK.getPointAt(i / N)), v3(NECK.getPointAt((i + 1) / N)), 30 - i * 1.5);
      for (const sx of [1, -1]) strut(torso, TUBE, C.sinew, [sx * 16, 506, 250], [sx * 12, 456, 380], 7);
    }

    // The skull: a weathered deer skull, small and long-faced, the jaw hanging a little open; empty black sockets.
    const head = new THREE.Matrix4().compose(HEAD_AT, _q.setFromEuler(new THREE.Euler(HEAD_PITCH, 0, 0)), _s.set(1, 1, 1));
    // In `head` space +Z runs out along the snout and +Y up over the brow.
    const hp = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(head);
    piece(torso, BALL, C.bone, [0, 0, 0], [68, 58, 78], [0, 0, 0], head);
    piece(torso, BALL, C.boneShade, [0, 2, -30], [54, 48, 34], [0, 0, 0], head);
    piece(torso, SNOUT, C.bone, [0, -8, 84], [44, 124, 34], [Math.PI / 2, 0, 0], head);
    piece(torso, box, C.boneShade, [0, 6, 82], [14, 6, 104], [0.08, 0, 0], head);
    // Brow ridges overhanging the sockets, cheekbones under them.
    for (const sx of [1, -1]) {
      piece(torso, NUB, C.bone, [sx * 22, 20, 24], [26, 12, 32], [0, 0, 0], head);
      piece(torso, NUB, C.boneShade, [sx * 22, -16, 34], [18, 16, 40], [0, 0, 0], head);
      // The sockets: deep, empty, black.
      piece(torso, BALL, C.socket, [sx * 27, 6, 28], [28, 26, 30], [0, 0, 0], head);
    }
    // Nasal cavity at the tip and the dark of the mouth under the upper jaw.
    piece(torso, box, C.socket, [0, -4, 140], [12, 10, 14], [0, 0, 0], head);
    piece(torso, box, C.socket, [0, -24, 82], [24, 8, 96], [0, 0, 0], head);
    // The lower jaw: two thin bars hinged under the skull, hanging slightly open, a few worn teeth.
    for (const sx of [1, -1]) {
      const j0 = hp(sx * 22, -18, 6);
      const j1 = hp(sx * 16, -40, 72);
      const j2 = hp(sx * 8, -42, 128);
      strut(torso, TUBE, C.boneShade, v3(j0), v3(j1), 7);
      strut(torso, TUBE, C.boneShade, v3(j1), v3(j2), 5);
      for (let i = 0; i < 3; i++) {
        _at.lerpVectors(j1, j2, 0.15 + i * 0.3);
        strut(torso, spike, C.boneShade, v3(_at), v3(_at.clone().add(hp(0, 12, 0).sub(HEAD_AT))), 3.5);
        const u = hp(sx * (13 - i * 2.5), -20, 70 + i * 22);
        strut(torso, spike, C.boneShade, v3(u), v3(u.clone().add(hp(0, -10, 0).sub(HEAD_AT))), 3.5);
      }
    }

    // Antlers: a small, gnarled whitetail rack. The beam sweeps back and out from the crown, then hooks forward;
    // tines rise off its top. Strands of dark moss and hair hang from it.
    for (const sx of [1, -1]) {
      const root = hp(sx * 20, 24, -10);
      const X = (x: number, y: number, z: number, j = 4) => root.clone().add(_tmp.set(sx * (x * RACK + jit(j)), y * RACK + jit(j), z * RACK + jit(j)));
      const beam = [X(0, 0, 0), X(24, 30, -24), X(56, 50, -30), X(86, 62, -12), X(102, 66, 20), X(104, 62, 54), X(92, 58, 82)];
      piece(torso, NUB, C.antler, v3(beam[0]!), [24, 14, 24]);
      branch(torso, C.antler, C.antlerTip, beam, 13, 7);
      // Tines: a short brow tine, then three off the beam, each bent its own way.
      branch(torso, C.antler, C.antlerTip, [beam[1]!, X(32, 58, -8), X(38, 80, 8, 8)], 7, 5);
      branch(torso, C.antler, C.antlerTip, [beam[3]!, X(86, 106, -18), X(76, 146, -4, 10)], 8, 5);
      branch(torso, C.antler, C.antlerTip, [beam[4]!, X(114, 100, 26), X(126, 128, 42, 10)], 7, 5);
      branch(torso, C.antler, C.antlerTip, [beam[5]!, X(112, 88, 72, 8)], 6, 4);
      for (const [i, len] of [[2, 58], [3, 40], [5, 70]] as const) {
        const at = beam[i]!.clone().add(_tmp.set(0, -6, 0));
        shard(torso, at, _dir.set(jit(0.15), -1, jit(0.15)), len, 4.5, C.moss, C.furDark, rand() * 3);
        shard(torso, at.add(_tmp.set(sx * 6, 0, 8)), _dir.set(jit(0.2), -1, jit(0.2)), len * 0.6, 3.5, C.furDark, C.moss, rand() * 3);
      }
    }

    // The mane: matted clumps of fur lying back and down along the withers and neck, all round the neck.
    {
      const curves: [THREE.CatmullRomCurve3, number, number, number][] = [[SPINE, 0.04, 1, 0.022], [NECK, 0, 0.92, 0.07]];
      const tan = new THREE.Vector3();
      const side = new THREE.Vector3();
      for (const [curve, u0, u1, du] of curves) {
        const neck = curve === NECK;
        for (let u = u0; u <= u1 + 1e-6; u += du) {
          curve.getPointAt(Math.min(1, u), p);
          curve.getTangentAt(Math.min(1, u), tan);
          side.crossVectors(tan, _up).normalize();
          const ups = _ly.crossVectors(side, tan).normalize();
          const angles = neck ? [-2.6, -1.9, -1.2, -0.6, 0, 0.6, 1.2, 1.9, 2.6, Math.PI] : [-1.4, -0.7, 0, 0.7, 1.4];
          for (const a0 of angles) {
            const a = a0 + jit(0.2);
            n.copy(ups).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
            const base = _lz.copy(p).addScaledVector(n, neck ? 22 : 24);
            const under = Math.cos(a) < -0.3;
            // Withers and the top of the neck carry the longest, shaggiest clumps; the throat hangs a ragged ruff.
            // The coat thins and shortens down the lower back to the rump.
            const hump = Math.exp(-(((u - 0.6) / 0.25) ** 2));
            const len = (under ? 80 : neck ? 70 : 42 + 52 * hump) * (0.75 + rand() * 0.5);
            _dir.copy(n).multiplyScalar(under ? 0.25 : 0.3).addScaledVector(tan, -0.8).addScaledVector(_down, under ? 1.1 : 0.35 + Math.abs(Math.sin(a)) * 0.6);
            shard(torso, base, _dir, len, (neck ? 13 : 16) + rand() * 6, furRoot(), furTip(), rand() * 3);
          }
        }
      }
    }
    // The mane spills down over the upper flanks and the shoulders, ending in a ragged edge.
    for (let z = -40; z <= 250; z += 19) {
      for (const sx of [1, -1]) {
        // The coat stays high on the back, baring the ribs on the flanks below.
        for (let t = 0.25; t <= coatReach(z); t += 0.27) {
          const th = sx * (t + jit(0.08));
          const zz = z + jit(7);
          cageAt(th, zz, -4, p, n);
          const len = (55 + 45 * smooth(0.6, 1.35, t)) * (0.7 + rand() * 0.6) * (zz < 60 ? 0.8 : 1);
          _dir.copy(n).multiplyScalar(0.35).addScaledVector(_down, 0.8).add(_tmp.set(0, 0, -0.45));
          shard(torso, p, _dir, len, 15 + rand() * 6, furRoot(), furTip(), rand() * 3);
        }
      }
    }
    for (const sx of [1, -1]) {
      const c = new THREE.Vector3(sx * (SHOULDER.x - 24), SHOULDER.y + 26, SHOULDER.z - 4);
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        n.set(sx * (0.55 + 0.45 * Math.cos(a)), 0.5 + 0.5 * Math.sin(a), 0.5 * Math.sin(a * 2 + 1)).normalize();
        p.copy(c).addScaledVector(n, 30);
        _dir.copy(n).multiplyScalar(0.5).addScaledVector(_down, 0.9).add(_tmp.set(0, 0, -0.3));
        shard(torso, p, _dir, 60 + rand() * 40, 15 + rand() * 6, furRoot(), furTip(), rand() * 3);
      }
    }
    // The chest: a long, ragged beard of fur hanging off the front of the trunk between the arms.
    for (let z = 175; z <= 250; z += 15) {
      for (let t = 1.2; t <= Math.PI + 1e-6; t += 0.32) {
        for (const sx of [1, -1]) {
          if (sx < 0 && t > Math.PI - 0.1) continue;
          cageAt(sx * (t + jit(0.06)), z + jit(6), -4, p, n);
          _dir.copy(n).multiplyScalar(0.3).addScaledVector(_down, 1).add(_tmp.set(0, 0, -0.15));
          shard(torso, p, _dir, (70 + 70 * smooth(1.6, 2.8, t)) * (0.7 + rand() * 0.6), 13 + rand() * 6, furRoot(), furTip(), rand() * 3);
        }
      }
    }
    // Thin strands hanging off the belly, and a ragged tuft of a tail.
    for (let z = -20; z <= 160; z += 26) {
      for (const sx of [1, -1]) {
        cageAt(sx * (Math.PI - 0.35 + jit(0.25)), z + jit(10), -4, p, n);
        shard(torso, p, _dir.set(jit(0.15), -1, -0.25), 40 + rand() * 50, 9 + rand() * 4, C.furDark, C.fur, rand() * 3);
      }
    }
    // A shaggy skirt over the rump and haunches.
    for (let z = -52; z <= -16; z += 12) {
      for (let t = -2.3; t <= 2.3; t += 0.38) {
        cageAt(t + jit(0.1), z + jit(4), -3, p, n);
        _dir.copy(n).multiplyScalar(0.4).addScaledVector(_down, 0.8).add(_tmp.set(0, 0, -0.5));
        shard(torso, p, _dir, (50 + rand() * 35) * (Math.abs(t) > 1.2 ? 1.2 : 1), 14 + rand() * 5, furRoot(), furTip(), rand() * 3);
      }
    }
    // Over the pelvis, hanging down over the tops of the haunches.
    for (let z = -170; z <= -80; z += 15) {
      for (let a = -2.1; a <= 2.1 + 1e-6; a += 0.35) {
        const aa = a + jit(0.1);
        n.set(Math.sin(aa), Math.cos(aa) * 0.8, -0.2).normalize();
        p.set(Math.sin(aa) * 84, 382 + Math.cos(aa) * 26 + (z + 125) * -0.35, z + jit(5));
        _dir.copy(n).multiplyScalar(0.3).addScaledVector(_down, 0.9).add(_tmp.set(0, 0, -0.4));
        shard(torso, p, _dir, (45 + rand() * 35) * (Math.abs(a) > 1 ? 1.25 : 1), 14 + rand() * 5, furRoot(), furTip(), rand() * 3);
      }
    }
    for (let k = 0; k < 7; k++) {
      p.set(jit(14), 352 + jit(8), -184 + jit(6));
      shard(torso, p, _dir.set(jit(0.4), -0.9 + jit(0.2), -0.8), 50 + rand() * 30, 11 + rand() * 4, furRoot(), furTip(), rand() * 3);
    }

    // Magma Lob points: two on the flanks behind the shoulders and one on the lumbar spine; `mouth` is where shots leave.
    const lobs: { at: THREE.Vector3; n: THREE.Vector3 }[] = [];
    for (const sx of [1, -1]) {
      const wn = new THREE.Vector3();
      lobs.push({ at: cageAt(sx * 0.62, -2, 2, new THREE.Vector3(), wn), n: wn });
    }
    lobs.push({ at: SPINE.getPointAt(0.12).add(new THREE.Vector3(0, 34, 0)), n: new THREE.Vector3(0, 1, -0.35).normalize() });
    for (const { at, n: wn } of lobs) {
      const vent = new THREE.Object3D();
      along(at, wn).decompose(vent.position, vent.quaternion, vent.scale);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 50, 0);
      vent.add(mouth);
      this.vents.push(mouth);
      this.shell.add(vent);
    }

    // The torso casts shadows but takes none: the mane and antlers would otherwise drown the trunk in shade.
    this.mesh(this.shell, this.keep(merge(torso)), this.bodyMat).receiveShadow = false;

    this.shell.position.copy(PIVOT).multiplyScalar(-1);
    this.body.add(this.shell);
    this.root.add(this.body);

    // Limbs (root space; placed by IK every frame). Limb space: Y runs from the joint nearer the body (−len/2) to
    // the far one (+len/2); +Z is the IK bend side.
    const limb = (build: (parts: THREE.BufferGeometry[]) => void, len: number) => {
      const parts: THREE.BufferGeometry[] = [];
      build(parts);
      return this.mesh(this.root, this.keep(merge(parts).scale(1, 1 / len, 1)), this.bodyMat);
    };
    /** Clumps of fur hanging down a limb (toward +Y) from heights y0..y1, round its +Z side within ±spread rad. */
    const limbFur = (p: THREE.BufferGeometry[], y0: number, y1: number, r: number, spread: number, count: number, len: number) => {
      for (let k = 0; k < count; k++) {
        const y = y0 + ((y1 - y0) * k) / Math.max(1, count - 1) + jit(6);
        const a = jit(spread);
        _at.set(Math.sin(a) * r, y, Math.cos(a) * r);
        _ref.set(Math.sin(a) * 0.45, 1, Math.cos(a) * 0.45);
        shard(p, _at, _ref, len * (0.7 + rand() * 0.6), 11 + rand() * 4, furRoot(), furTip(), rand() * 3);
      }
    };
    const upperGeo = (p: THREE.BufferGeometry[]) => {
      const L = UPPER / 2;
      piece(p, SHAPES.limb, C.skin, [0, 0, 0], [30, UPPER - 20, 30]);
      piece(p, NUB, C.skinDark, [0, -L + 70, -4], [44, 110, 40]);
      // The deltoid cap over the joint, so the arm stays rooted in the shoulder however it swings.
      piece(p, NUB, C.skinDark, [0, -L + 18, 0], [62, 78, 58]);
      piece(p, box, C.sinew, [0, 6, -16], [10, UPPER * 0.66, 8]);
      // A bony elbow under the skin.
      piece(p, BALL, C.skinLight, [0, L - 4, 2], [38, 36, 38]);
      // Fur cloaking the shoulder and hanging off the back of the upper arm.
      limbFur(p, -L + 6, -L + 40, 20, Math.PI, 10, 66);
      limbFur(p, -L + 40, 30, 16, 2.2, 10, 60);
    };
    const foreGeo = (p: THREE.BufferGeometry[]) => {
      const L = FORE / 2;
      // Two bones under taut skin, a sinew cord between, a knobbed wrist.
      piece(p, TUBE, C.skin, [6, 0, 0], [26, FORE - 10, 26]);
      piece(p, TUBE, C.skinLight, [-10, 4, -5], [15, FORE - 50, 15]);
      piece(p, box, C.sinew, [0, -6, 13], [8, FORE * 0.6, 7]);
      piece(p, BALL, C.skinLight, [0, L - 8, 0], [34, 30, 34]);
    };
    const handGeo = (p: THREE.BufferGeometry[]) => {
      // Root-aligned, centred on the palm FIST_R above the ground (the wrist): four long, bony, knuckled fingers
      // arching up then down to black claws on the ground, splayed forward, and a hooked thumb behind. The spread
      // is scaled by HAND; the claw tips still reach the ground.
      const h = (x: number, y: number, z: number): V3 => [x * HAND, y > 0 ? y * HAND : y, z * HAND];
      piece(p, BALL, C.skinDark, h(0, 2, 8), [60 * HAND, 30, 74 * HAND]);
      for (const ang of [-0.55, -0.18, 0.18, 0.55]) {
        const s = Math.sin(ang);
        const c = Math.cos(ang);
        const k = h(s * 24, 4, c * 34);
        const j1 = h(s * 70, 36, c * 96);
        const j2 = h(s * 108, -20, c * 146);
        const tip = h(s * 120, -FIST_R + 2, c * 176);
        piece(p, NUB, C.skinLight, k, [15, 15, 15]);
        strut(p, TUBE, C.skin, k, j1, 6.5);
        piece(p, NUB, C.skinLight, j1, [15, 15, 15]);
        strut(p, TUBE, C.skinDark, j1, j2, 5.5);
        piece(p, NUB, C.skinLight, j2, [12, 12, 12]);
        strut(p, spike, C.horn, j2, tip, 6.5);
      }
      strut(p, TUBE, C.skin, h(0, -6, -24), h(0, -34, -62), 6.5);
      strut(p, spike, C.horn, h(0, -34, -62), h(0, -FIST_R + 2, -88), 6.5);
    };
    const thighGeo = (p: THREE.BufferGeometry[]) => {
      const L = THIGH / 2;
      // A lean, wasted haunch under a shaggy fringe of fur; the knee knob forward.
      piece(p, NUB, C.skin, [0, -14, 0], [50, THIGH + 10, 46]);
      piece(p, box, C.sinew, [0, 0, -22], [10, THIGH * 0.6, 8]);
      piece(p, BALL, C.skinLight, [0, L - 2, 6], [38, 36, 38]);
      for (let k = 0; k < 8; k++) {
        const a = Math.PI + jit(1.7);
        _at.set(Math.sin(a) * 20, -L + 6 + (k % 4) * 18, Math.cos(a) * 20);
        shard(p, _at, _ref.set(Math.sin(a) * 0.25, 1, Math.cos(a) * 0.25), 60 + rand() * 30, 12 + rand() * 4, furRoot(), furTip(), rand() * 3);
      }
    };
    const shinGeo = (p: THREE.BufferGeometry[]) => {
      const L = SHIN / 2;
      // A thin bone back to the hock, its tendon cord behind; a bony hock.
      piece(p, TUBE, C.skin, [0, 0, 0], [24, SHIN, 24]);
      piece(p, box, C.sinew, [0, 10, -16], [9, SHIN * 0.8, 8]);
      piece(p, BALL, C.skinLight, [0, L - 2, -6], [32, 32, 32]);
    };
    const footGeo = (p: THREE.BufferGeometry[]) => {
      // Root-aligned on the hoof's ground point: the cannon bone from the hock down to a cloven black hoof.
      const fet: V3 = [0, 34, 6];
      strut(p, TUBE, C.skinDark, [HOCK.x, HOCK.y, HOCK.z], fet, 11);
      piece(p, NUB, C.skinLight, fet, [26, 24, 26]);
      strut(p, TUBE, C.skinDark, fet, [0, 16, 22], 10);
      for (const sx of [1, -1]) piece(p, TRI, C.horn, [sx * 11, 13, 30], [24, 26, 54], [0, sx * 0.08, 0]);
      for (const sx of [1, -1]) strut(p, spike, C.horn, [sx * 9, 36, -6], [sx * 12, 12, -22], 5);
    };
    for (let i = 0; i < 2; i++) {
      this.limbArms.push({ upper: limb(upperGeo, UPPER), fore: limb(foreGeo, FORE), fist: limb(handGeo, 1) });
      this.legs.push({ thigh: limb(thighGeo, THIGH), shin: limb(shinGeo, SHIN), foot: limb(footGeo, 1) });
    }

    // Shadow tendrils writhing off the back; Vent Burst whips one at a flyer.
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

    // Shadow tendrils off the back (longer with heat); for Vent Burst the nearest one cocks back and cracks onto the flyer.
    const lashAt = f.antiAir ? this.root.worldToLocal(_aim.copy(f.antiAir.target)) : null;
    const hot = Math.max(f.heat, f.roaring ? 1 : 0);
    this.flares.update(f.dt, f.time, _rel, this.root.matrixWorld, lashAt, f.antiAir ? Math.min(1, f.antiAir.weight) : 0, hot, f.pose.collapse);

    // The body is matte: its emissive carries only the hit flash and the level-up glow.
    if (f.flash) this.bodyMat.emissive.setHex(0xffffff);
    else this.bodyMat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
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

  /** Shots leave from the lob points on the back in turn. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    const v = this.vents[this.nextVent++ % this.vents.length]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  /** The first lob point. */
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
