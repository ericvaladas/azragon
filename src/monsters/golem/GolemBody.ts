import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, painted, toonMat } from '../../render/toon';
import { solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { fistKind, lungeAmount, lungeWeight, strikeReturn, strikeStarted, type FistKind } from './fist';
import { FireTendrils } from './FireTendrils';
import { merge, piece, rng, SHAPES, tuftGeometry, type V3 } from './golemParts';
import { SWING, limbPlanted, limbSwing } from './knuckleGait';

const G = CONFIG.golem;
const C = G.colors;
/** Model units (before CONFIG.monster.scale). The torso pivots here (just behind the hips). */
const PIVOT = new THREE.Vector3(0, 250, -60);
const UPPER = 250;
const FORE = 260;
const THIGH = 160;
const SHIN = 150;
const FIST_R = 85;
/** Torso-space shoulder and hip on the left (+X); the right mirrors x. */
const SHOULDER = new THREE.Vector3(200, 480, 80);
const HIP = new THREE.Vector3(120, 250, -110);
/** Root-space rest spots (left side) of a planted fist (its centre) and foot, and how high each lifts mid-swing. */
const FIST_AT = new THREE.Vector3(250, FIST_R, 230);
const FOOT_AT = new THREE.Vector3(150, 0, -130);
const FIST_LIFT = 130;
const FOOT_LIFT = 70;
/** Slam: where the fist rises (left side) before it drops. Backhand: where it cocks across the chest, and its sweep radius. */
const SLAM_RAISE = new THREE.Vector3(170, 620, 260);
const BACKHAND_COCK = new THREE.Vector3(-60, 280, 320);
const BACKHAND_R = 450;
const ARM_REACH = UPPER + FORE - 30;
/**
 * Molten Fist lunge: for a target farther than the fist reaches standing (LUNGE_FROM for a slam, BACKHAND_R for a
 * backhand), the torso shifts toward the strike by the shortfall (up to LUNGE_MAX), sinks up to LUNGE_DROP and leans
 * up to LUNGE_LEAN rad, so the fist reaches it.
 */
const LUNGE_FROM = 380;
const LUNGE_MAX = 200;
const LUNGE_DROP = 60;
const LUNGE_LEAN = 0.25;
/** Molten Fist: seconds the fist stays on its target after impact before it eases home. */
const STRIKE_HOLD = 0.1;
/** Eruption: seconds for both fists to rise and slam. */
const NOVA_TIME = 0.6;

/**
 * The shell (torso space): a top-heavy egg turned about an axis that rises from EGG_BASE (behind the hips) and
 * leans forward EGG_TILT rad over the knuckle-walk. `h` runs 0..1 along the axis (EGG_LEN), `phi` around it
 * (0 = front, π/2 = left, π = back); the widest ring (EGG_R) sits at h = EGG_PEAK; the depth is squashed by EGG_D.
 */
const EGG_BASE = new THREE.Vector3(0, 188, -128);
const EGG_TILT = 0.38;
const EGG_LEN = 530;
const EGG_R = 218;
const EGG_D = 0.9;
const EGG_PEAK = 0.62;
const EGG_K = Math.log(0.5) / Math.log(EGG_PEAK);
const EGG_ROT = new THREE.Matrix4().makeRotationX(EGG_TILT);
/** Profile rings of the shell's lathe (h); the panel seams run along the rings in SEAM_H. */
const EGG_RINGS = [0, 0.04, 0.1, 0.18, 0.3, 0.42, 0.52, 0.62, 0.72, 0.85, 0.92, 0.97, 1];
const SEAM_H = [0.3, 0.62, 0.85];
/** Radial segments of the shell; the meridian seams run along every fourth (diagonals between the panels). */
const EGG_SEGS = 16;

/** Shell radius at h. */
function eggR(h: number): number {
  if (h <= 0 || h >= 1) return 0;
  return EGG_R * Math.pow(Math.sin(Math.PI * Math.pow(h, EGG_K)), 0.7);
}

/** The point at (h, phi) on the shell (torso space), without lift. */
function eggAt(h: number, phi: number, out: THREE.Vector3): THREE.Vector3 {
  const r = eggR(h);
  return out.set(r * Math.sin(phi), h * EGG_LEN, r * Math.cos(phi) * EGG_D).applyMatrix4(EGG_ROT).add(EGG_BASE);
}

const _ea = new THREE.Vector3();
const _eb = new THREE.Vector3();
const _ec = new THREE.Vector3();
/**
 * The point at (h, phi) on the shell, lifted `lift` along its outward normal (written to `nrm` when given).
 * Torso space.
 */
function eggSurf(h: number, phi: number, lift = 0, out = new THREE.Vector3(), nrm?: THREE.Vector3): THREE.Vector3 {
  const e = 1e-3;
  const hh = Math.min(0.985, Math.max(0.015, h));
  eggAt(hh + e, phi, _ea).sub(eggAt(hh - e, phi, _eb));
  eggAt(hh, phi + e, _eb).sub(eggAt(hh, phi - e, _ec));
  _ec.crossVectors(_eb, _ea).normalize();
  if (nrm) nrm.copy(_ec);
  return eggAt(h, phi, out).addScaledVector(_ec, lift);
}

/** Fire tendrils rise from the exhaust stacks away from this point (torso space): the shell's heart. */
const HUMP_CENTRE = new THREE.Vector3(0, 0.5 * EGG_LEN, 0).applyMatrix4(EGG_ROT).add(EGG_BASE);
/** Exhaust stacks (torso space), left then right, on the upper back: base on the shell, axis away from HUMP_CENTRE. */
const STACK_H = 70;
const STACKS = [1, -1].map((sx) => {
  const base = eggSurf(0.76, Math.PI - sx * 0.62, -8);
  const axis = base.clone().sub(HUMP_CENTRE).normalize();
  return { base, axis, mouth: base.clone().addScaledVector(axis, STACK_H) };
});
/** Fire tendrils (torso space): two from each stack's mouth. */
const TENDRIL_ROOTS: readonly THREE.Vector3[] = STACKS.flatMap(({ mouth, axis }) => {
  const across = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();
  return [mouth.clone().addScaledVector(across, 12), mouth.clone().addScaledVector(across, -12)];
});
/** Magma Lob hatches (h, phi on the shell): Magma Lob, Ember Storm and Pyroclast leave from these in turn. */
const HATCHES: readonly (readonly [number, number])[] = [
  [0.52, Math.PI - 0.55],
  [0.52, Math.PI + 0.55],
  [0.9, Math.PI],
];
/** The head (torso space): a forward-jutting tube on a short neck from the front of the shell's crown. */
const HEAD_AT = new THREE.Vector3(0, 596, 262);
const HEAD_R = 54;
const HEAD_LEN = 150;
const HEAD_PITCH = 0.18;

const _rel = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _at = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _col = new THREE.Color();
const _lx = new THREE.Vector3();
const _ref = new THREE.Vector3();
const _ly = new THREE.Vector3();
const _lz = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _gait = new THREE.Vector3();
const _fist = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _raise = new THREE.Vector3();
const _end = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _world = new THREE.Vector3();
const _lunge = new THREE.Vector3();

/** Extra unit shapes for the robot: an eight-sided tube, one widening toward +Y, and a round lens (axis Y). */
const TUBE = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
const FLARE = faceted(new THREE.CylinderGeometry(0.6, 0.5, 1, 8));
const LENS = faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
/** Ball and lumpy nub of diameter 1 (SHAPES.blob and .boulder are radius 1). */
const BALL = faceted(new THREE.IcosahedronGeometry(0.5, 1));
const NUB = faceted(new THREE.IcosahedronGeometry(0.5, 0));

/** Matrix placing a part at `pos` with its local +Y along `dir`, turned `spin` rad about it. */
function along(pos: THREE.Vector3, dir: THREE.Vector3, spin = 0, out = new THREE.Matrix4()): THREE.Matrix4 {
  _q.setFromUnitVectors(_up, _tmp.copy(dir).normalize()).multiply(_q2.setFromAxisAngle(_up, spin));
  return out.compose(pos, _q, _s.set(1, 1, 1));
}

/** A tube (`shape`, radius 0.5 units) of radius r from a to b, appended painted. */
function strut(out: THREE.BufferGeometry[], shape: THREE.BufferGeometry, color: number, a: V3, b: V3, r: number): void {
  const pa = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(pa);
  const len = d.length();
  piece(out, shape, color, [0, 0, 0], [r * 2, len, r * 2], [0, 0, 0], along(pa.addScaledVector(d, 0.5), d));
}

/** Seam strip (unit-box matrix) from a to b on a surface with outward normal n, `w` wide. */
function stripMatrix(a: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3, w: number): THREE.Matrix4 {
  _lx.subVectors(b, a);
  const len = _lx.length();
  _lx.divideScalar(len);
  _lz.copy(n).addScaledVector(_lx, -n.dot(_lx)).normalize();
  _ly.crossVectors(_lz, _lx);
  return new THREE.Matrix4()
    .makeBasis(_lx, _ly, _lz)
    .scale(_s.set(len + w * 0.5, w, 8))
    .setPosition(_at.addVectors(a, b).multiplyScalar(0.5).addScaledVector(n, 2));
}

/**
 * Stretch a height-1, centred limb mesh from a to b (like placeSegment), turned about its axis so its local +Z
 * leans toward `ref` (the IK bend direction): a stable twist, so the armour plates and collars never spin.
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
 * The Magma Golem: an ancient robot, rust-brown and overgrown. A top-heavy egg of curved armour panels whose seams
 * glow faintly with the magma inside; moss, grass and vines on its back and shoulders; a small tube head jutting
 * forward on a short neck with round glowing eyes; a Molten Core port in its chest. Very long thin arms end in
 * three-clawed hands it knuckle-walks on; short stalky legs on broad flat feet; magma glows in every joint. Two
 * exhaust stacks on its back throw fire tendrils that whip at flyers; three hatches lob magma. Faces +Z; +X is its left.
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
  /** One vertex-coloured material for the whole shell, limbs and greenery (the plants tinted per instance). */
  private bodyMat: THREE.MeshToonMaterial;
  /** Magma in the joint gaps and exhaust throats. */
  private jointMat: THREE.MeshToonMaterial;
  /** The faint glow along the panel seams. */
  private seamMat: THREE.MeshToonMaterial;
  private coreMat: THREE.MeshToonMaterial;
  private eyeMat: THREE.MeshToonMaterial;
  private seams!: THREE.InstancedMesh;
  private plants!: THREE.InstancedMesh;
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
    this.coreMat = toonMat(C.core, { emissive: C.core });
    this.eyeMat = toonMat(C.eye, { emissive: C.eye });
    this.tintMats = [this.bodyMat];
    const { box, boulder, collar, spike } = SHAPES;
    const torso: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const seams: THREE.Matrix4[] = [];
    const plants: { m: THREE.Matrix4; c: number }[] = [];
    const rand = rng(11);
    const mossTones = [C.moss, C.mossDark, C.moss, C.mossLight];
    const plant = (at: THREE.Vector3, dir: THREE.Vector3, len: number, wide: number, c: number) => {
      _q.setFromUnitVectors(_down, _tmp.copy(dir).normalize());
      _q.multiply(_q2.setFromAxisAngle(_down, rand() * Math.PI * 2));
      plants.push({ m: new THREE.Matrix4().compose(at.clone(), _q.clone(), _s.set(wide, len, wide).clone()), c });
    };

    // The shell: a lathed egg of curved armour panels, banded and quartered, its lower panels grimier.
    const pts = EGG_RINGS.map((h) => new THREE.Vector2(eggR(h), h * EGG_LEN));
    const egg = faceted(new THREE.LatheGeometry(pts, EGG_SEGS));
    egg.applyMatrix4(_m.makeScale(1, 1, EGG_D)).applyMatrix4(EGG_ROT).translate(EGG_BASE.x, EGG_BASE.y, EGG_BASE.z);
    {
      const pos = egg.getAttribute('position');
      const colors = new Float32Array(pos.count * 3);
      const inv = EGG_ROT.clone().invert();
      for (let i = 0; i < pos.count; i += 3) {
        _at.set(0, 0, 0);
        for (let k = 0; k < 3; k++) _at.add(_n.fromBufferAttribute(pos, i + k));
        _at.divideScalar(3).sub(EGG_BASE).applyMatrix4(inv);
        const h = _at.y / EGG_LEN;
        const phi = Math.atan2(_at.x, _at.z / EGG_D);
        const band = SEAM_H.filter((s) => h > s).length;
        const quarter = Math.floor((((phi + Math.PI / 4) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 2));
        let c: number = [C.shellDark, quarter % 2 ? C.shell : C.shellLight, quarter % 2 ? C.shellLight : C.shell, C.shell][band]!;
        // Rust streaks: a few facets a shade darker.
        if (rand() < 0.12) c = c === C.shellDark ? C.metalLight : C.shellDark;
        _col.setHex(c);
        for (let k = 0; k < 3; k++) colors.set([_col.r, _col.g, _col.b], (i + k) * 3);
      }
      egg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      torso.push(egg);
    }
    // Panel seams (faintly glowing strips) along three rings and four diagonal meridians, rivets beside them.
    const seg = (Math.PI * 2) / EGG_SEGS;
    for (const h of SEAM_H) {
      for (let j = 0; j < EGG_SEGS; j++) {
        const a = eggAt(h, j * seg, new THREE.Vector3());
        const b = eggAt(h, (j + 1) * seg, new THREE.Vector3());
        eggSurf(h, (j + 0.5) * seg, 0, _at, _n);
        seams.push(stripMatrix(a, b, _n, 12));
        if (j % 2 === 0) {
          eggSurf(h + 0.03, (j + 0.5) * seg, 2, _at, _n);
          piece(torso, boulder, C.metal, [_at.x, _at.y, _at.z], [11, 11, 11]);
        }
      }
    }
    for (let k = 0; k < 4; k++) {
      const phi = Math.PI / 4 + (k * Math.PI) / 2;
      const rings = EGG_RINGS.filter((h) => h >= SEAM_H[0]! && h <= SEAM_H[2]!);
      for (let j = 0; j + 1 < rings.length; j++) {
        const a = eggAt(rings[j]!, phi, new THREE.Vector3());
        const b = eggAt(rings[j + 1]!, phi, new THREE.Vector3());
        eggSurf((rings[j]! + rings[j + 1]!) / 2, phi, 0, _at, _n);
        seams.push(stripMatrix(a, b, _n, 11));
        eggSurf((rings[j]! + rings[j + 1]!) / 2, phi + 0.09, 2, _at);
        piece(torso, boulder, C.metal, [_at.x, _at.y, _at.z], [10, 10, 10]);
      }
    }

    // Pelvis: a dark drum between the hips, ball sockets either side (magma in the gap).
    piece(torso, TUBE, C.metal, [0, HIP.y + 6, HIP.z], [118, 2 * HIP.x - 30, 118], [0, 0, Math.PI / 2]);
    piece(torso, TUBE, C.shellDark, [0, HIP.y + 30, HIP.z + 10], [150, 150, 130], [0, 0, Math.PI / 2]);
    for (const sx of [1, -1]) piece(torso, TUBE, C.metal, [sx * (HIP.x - 40), HIP.y, HIP.z], [104, 22, 104], [0, 0, Math.PI / 2]);

    // Shoulders: round pauldron domes over dark sockets, magma showing between socket and arm.
    for (const sx of [1, -1]) {
      piece(torso, BALL, C.shell, [sx * 214, SHOULDER.y + 40, SHOULDER.z - 6], [150, 100, 164], [0, 0, -sx * 0.35]);
      piece(torso, TUBE, C.metal, [sx * (SHOULDER.x - 22), SHOULDER.y - 4, SHOULDER.z], [112, 34, 112], [0, 0, Math.PI / 2]);
      piece(glow, TUBE, C.glow, [sx * (SHOULDER.x - 2), SHOULDER.y - 4, SHOULDER.z], [96, 16, 96], [0, 0, Math.PI / 2]);
      // A rim of rivets around the dome.
      for (let k = 0; k < 6; k++) {
        const a = -0.9 + k * 0.42;
        piece(torso, boulder, C.metal, [sx * (214 + Math.cos(a) * 70), SHOULDER.y + 22, SHOULDER.z - 6 + Math.sin(a) * 76], [10, 10, 10]);
      }
    }

    // The head: a tube jutting forward on a short neck, round lenses in a dark face ring, a fin on top.
    const neckA = eggSurf(0.9, 0, -20);
    strut(torso, TUBE, C.metal, [neckA.x, neckA.y, neckA.z], [HEAD_AT.x, HEAD_AT.y - 8, HEAD_AT.z - HEAD_LEN * 0.35], 34);
    for (let k = 0; k < 3; k++) {
      const u = 0.25 + k * 0.22;
      _at.lerpVectors(neckA, HEAD_AT, u);
      piece(torso, TUBE, C.metalLight, [_at.x, _at.y - 4, _at.z], [84, 12, 84], [Math.PI / 2 - 0.3, 0, 0]);
    }
    const head = new THREE.Matrix4().compose(HEAD_AT, _q.setFromEuler(new THREE.Euler(Math.PI / 2 + HEAD_PITCH, 0, 0)), _s.set(1, 1, 1));
    // In `head` space the tube runs along +Y (forward, tipped down HEAD_PITCH) and −Z is up.
    piece(torso, LENS, C.shell, [0, 0, 0], [HEAD_R * 2, HEAD_LEN, HEAD_R * 2], [0, 0, 0], head);
    piece(torso, LENS, C.shellLight, [0, -HEAD_LEN * 0.2, 0], [HEAD_R * 2 + 8, 26, HEAD_R * 2 + 8], [0, 0, 0], head);
    piece(torso, BALL, C.shellDark, [0, -HEAD_LEN / 2, 0], [HEAD_R * 1.9, 44, HEAD_R * 1.9], [0, 0, 0], head);
    piece(torso, LENS, C.metal, [0, HEAD_LEN / 2 + 4, 0], [HEAD_R * 2 + 6, 16, HEAD_R * 2 + 6], [0, 0, 0], head);
    piece(torso, LENS, C.metal, [0, HEAD_LEN / 2 + 2, 0], [HEAD_R * 1.7, 16, HEAD_R * 1.7], [0, 0, 0], head);
    // A fin along the top, bolts on the sides.
    piece(torso, box, C.shellDark, [0, -6, -HEAD_R - 8], [14, HEAD_LEN * 0.8, 26], [0, 0, 0], head);
    for (const sx of [1, -1]) piece(torso, LENS, C.metal, [sx * (HEAD_R + 2), -10, 0], [34, 14, 34], [0, 0, Math.PI / 2], head);
    const eyes: THREE.BufferGeometry[] = [];
    for (const sx of [1, -1]) {
      piece(torso, LENS, C.metal, [sx * 24, HEAD_LEN / 2 + 10, -8], [48, 10, 48], [0, 0, 0], head);
      piece(eyes, LENS, C.eye, [sx * 24, HEAD_LEN / 2 + 14, -8], [36, 10, 36], [0, 0, 0], head);
    }
    // A small third lens below.
    piece(eyes, LENS, C.eye, [0, HEAD_LEN / 2 + 12, 30], [14, 8, 14], [0, 0, 0], head);

    // The Molten Core: a glowing port in the chest behind a dark collar and grille bars.
    const core: THREE.BufferGeometry[] = [];
    const coreN = new THREE.Vector3();
    const coreAt = eggSurf(0.64, 0, 0, new THREE.Vector3(), coreN);
    const port = along(coreAt, coreN);
    piece(torso, collar, C.metal, [0, 2, 0], [52, 26, 52], [0, 0, 0], port);
    piece(core, LENS, C.core, [0, 12, 0], [92, 8, 92], [0, 0, 0], port);
    for (const x of [-26, 0, 26]) piece(torso, box, C.metal, [x, 18, 0], [10, 8, 96 - Math.abs(x) * 0.9], [0, 0, 0], port);

    // Exhaust stacks: dark pipes with a rust band, magma in the throat; the fire tendrils leave their mouths.
    for (const { base, axis } of STACKS) {
      const M = along(base, axis);
      piece(torso, collar, C.metal, [0, STACK_H / 2, 0], [34, STACK_H, 34], [0, 0, 0], M);
      piece(torso, TUBE, C.shellDark, [0, STACK_H * 0.45, 0], [88, 16, 88], [0, 0, 0], M);
      piece(torso, TUBE, C.metal, [0, STACK_H, 0], [80, 12, 80], [0, 0, 0], M);
      piece(glow, LENS, C.glow, [0, STACK_H + 5, 0], [60, 6, 60], [0, 0, 0], M);
    }

    // Magma Lob hatches: round dark collars on a flange, rivets around; `mouth` is where shots leave.
    const throat = this.keep(new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2));
    const keepOut: { p: THREE.Vector3; r: number }[] = STACKS.map(({ base }) => ({ p: base, r: 80 }));
    HATCHES.forEach(([h, phi]) => {
      const n = new THREE.Vector3();
      const at = eggSurf(h, phi, -4, new THREE.Vector3(), n);
      keepOut.push({ p: at, r: 70 });
      const vent = new THREE.Object3D();
      along(at, n).decompose(vent.position, vent.quaternion, vent.scale);
      vent.updateMatrix();
      piece(torso, collar, C.metal, [0, 8, 0], [40, 26, 40], [0, 0, 0], vent.matrix);
      piece(torso, TUBE, C.shellDark, [0, 6, 0], [100, 6, 100], [0, 0, 0], vent.matrix);
      for (let k = 0; k < 6; k++) piece(torso, boulder, C.metal, [Math.sin(k * 1.05) * 47, 9, Math.cos(k * 1.05) * 47], [8, 8, 8], [0, 0, 0], vent.matrix);
      const mat = toonMat(C.magma, { emissive: C.magma });
      this.ventMats.push(mat);
      this.ventFlash.push(0);
      this.mesh(vent, throat, mat, false).position.set(0, 21.5, 0);
      vent.children[0]!.scale.set(33, 1, 33);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 50, 0);
      vent.add(mouth);
      this.vents.push(mouth);
      this.shell.add(vent);
    });
    keepOut.push({ p: neckA, r: 90 });

    // Moss: flattened green lumps half sunk into the upper back and the shoulder domes, grass and leaves in it.
    const moss: { p: THREE.Vector3; r: number }[] = [];
    const blocked = (p: THREE.Vector3, pad: number) => keepOut.some((k) => k.p.distanceTo(p) < k.r + pad);
    const lump = (at: THREE.Vector3, n: THREE.Vector3, size: number) => {
      _q.setFromUnitVectors(_up, n).multiply(_q2.setFromAxisAngle(_up, rand() * Math.PI * 2));
      const g = boulder.clone().applyMatrix4(_m.compose(at, _q, _s.set(size, size * (0.14 + rand() * 0.14), size * (0.7 + rand() * 0.4))));
      torso.push(painted(g, mossTones[Math.floor(rand() * mossTones.length)]!));
      moss.push({ p: at.clone(), r: size });
    };
    for (let i = 0; i < 400 && moss.length < 46; i++) {
      // Biased to the crown and the back, thinning toward the sides.
      const h = 0.5 + Math.pow(rand(), 0.6) * 0.5;
      const phi = Math.PI + (rand() * 2 - 1) * (h > 0.85 ? Math.PI : 1.5);
      eggSurf(h, phi, -6, _at, _n);
      if (_n.y < 0.3 || blocked(_at, 0) || moss.some((q) => q.p.distanceTo(_at) < q.r * 0.9)) continue;
      lump(_at, _n, 34 + rand() * 38);
    }
    for (const sx of [1, -1]) {
      for (let k = 0; k < 5; k++) {
        _n.set(sx * (0.2 + rand() * 0.5), 1, (rand() - 0.6) * 0.8).normalize();
        _at.set(sx * 214, SHOULDER.y + 40, SHOULDER.z - 6).add(_tmp.copy(_n).multiply(_s.set(66, 44, 72)));
        lump(_at, _n, 30 + rand() * 24);
      }
    }
    // Grass tufts and leaves in the moss.
    const greens = [C.mossLight, C.moss, C.vine, C.mossLight];
    for (const { p, r } of moss) {
      const n = Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        _dir.set(rand() - 0.5, 0, rand() - 0.5).multiplyScalar(r * 0.8);
        _n.set((rand() - 0.5) * 0.6, 1, (rand() - 0.5) * 0.6);
        plant(_at.copy(p).add(_dir), _n, 26 + rand() * 30, 14 + rand() * 10, greens[Math.floor(rand() * greens.length)]!);
      }
      if (rand() < 0.18) piece(torso, box, rand() < 0.5 ? C.flower : C.flowerAlt, [p.x + (rand() - 0.5) * r, p.y + 10, p.z + (rand() - 0.5) * r], [13, 13, 13], [rand(), rand(), 0]);
    }
    // Two saplings sprouting from the crown: a thin stem and a few broad leaves.
    for (const [h, phi, tall] of [[0.94, Math.PI * 0.75, 90], [0.8, Math.PI * 1.12, 70]] as const) {
      const base = eggSurf(h, phi, -4);
      const top = base.clone().add(_tmp.set((rand() - 0.5) * 30, tall, -10));
      strut(torso, TUBE, C.vine, [base.x, base.y, base.z], [top.x, top.y, top.z], 5);
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7 + rand();
        const u = 0.55 + k * 0.15;
        _at.lerpVectors(base, top, u);
        piece(torso, BALL, k % 2 ? C.mossLight : C.moss, [_at.x + Math.sin(a) * 22, _at.y + 4, _at.z + Math.cos(a) * 22], [46, 8, 24], [0.3, a, 0.2]);
      }
    }
    // Vines trailing down the flanks and back from the moss, leaves along them; a few dangle off the shoulders.
    const vineAt = new THREE.Vector3();
    const vineN = new THREE.Vector3();
    for (const [h0, phi0, steps] of [
      [0.74, Math.PI / 2 + 0.5, 9], [0.7, Math.PI / 2 + 1.1, 7], [0.68, -Math.PI / 2 - 0.5, 8], [0.72, -Math.PI / 2 - 1.15, 9],
      [0.6, Math.PI - 0.15, 6], [0.82, Math.PI / 2 - 0.2, 6], [0.8, -Math.PI / 2 + 0.25, 5],
    ] as const) {
      let h = h0;
      let phi = phi0;
      const prev = eggSurf(h, phi, 4);
      for (let k = 0; k < steps; k++) {
        h -= 0.045;
        phi += (rand() - 0.5) * 0.12;
        eggSurf(h, phi, 4, vineAt, vineN);
        torso.push(painted(box.clone().applyMatrix4(stripMatrix(prev, vineAt, vineN, 9)), C.vine));
        if (k % 2 === 0) piece(torso, box, k % 4 ? C.mossLight : C.moss, [vineAt.x, vineAt.y, vineAt.z], [24, 6, 14], [rand() * 3, rand() * 3, rand() * 3]);
        prev.copy(vineAt);
      }
    }
    for (const sx of [1, -1]) {
      for (const [dz, len] of [[-50, 4], [40, 3]] as const) {
        let p = new THREE.Vector3(sx * 300, SHOULDER.y + 10, SHOULDER.z + dz);
        for (let k = 0; k < len; k++) {
          const q = p.clone().add(_tmp.set(sx * (rand() - 0.3) * 10, -26, (rand() - 0.5) * 10));
          strut(torso, TUBE, C.vine, [p.x, p.y, p.z], [q.x, q.y, q.z], 5);
          if (k % 2) piece(torso, box, C.mossLight, [q.x, q.y, q.z], [20, 5, 12], [rand() * 3, rand() * 3, 0]);
          p = q;
        }
      }
    }

    this.mesh(this.shell, this.keep(merge(torso)), this.bodyMat);
    this.mesh(this.shell, this.keep(merge(glow)), this.jointMat, false);
    this.mesh(this.shell, this.keep(merge(core)), this.coreMat, false);
    this.mesh(this.shell, this.keep(merge(eyes)), this.eyeMat, false);
    this.seams = new THREE.InstancedMesh(box, this.seamMat, seams.length);
    seams.forEach((m, i) => this.seams.setMatrixAt(i, m));
    this.shell.add(this.seams);
    const plantGeo = this.keep(tuftGeometry());
    this.plants = new THREE.InstancedMesh(plantGeo, this.bodyMat, plants.length);
    plants.forEach((t, i) => {
      this.plants.setMatrixAt(i, t.m);
      this.plants.setColorAt(i, _col.setHex(t.c));
    });
    this.plants.castShadow = true;
    this.plants.receiveShadow = true;
    this.shell.add(this.plants);

    this.shell.position.copy(PIVOT).multiplyScalar(-1);
    this.body.add(this.shell);
    this.root.add(this.body);

    // Limbs (root space; placed by IK every frame). Limb space: Y runs from the joint nearer the body (−len/2) to
    // the far one (+len/2); +Z is the IK bend side. Magma glows in the gap between each joint's dark collars.
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
      piece(p, TUBE, C.shell, [0, 0, 0], [62, UPPER - 70, 62]);
      piece(p, TUBE, C.shellDark, [0, -L + 64, 0], [82, 30, 82]);
      piece(p, box, C.shellLight, [0, -4, 22], [44, UPPER * 0.5, 30]);
      piece(g, BALL, C.glow, [0, -L + 4, 0], [70, 70, 70]);
      piece(p, TUBE, C.metal, [0, -L + 38, 0], [88, 20, 88]);
      piece(p, TUBE, C.metal, [0, L - 32, 0], [82, 18, 82]);
      // A strand of moss on the top of the upper arm.
      piece(p, NUB, C.moss, [0, -L + 90, -30], [50, 70, 24]);
    };
    const foreGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      const L = FORE / 2;
      piece(p, FLARE, C.shell, [0, 6, 0], [60, FORE - 100, 60]);
      piece(g, BALL, C.glow, [0, -L, 0], [66, 66, 66]);
      piece(p, TUBE, C.metal, [0, -L + 34, 0], [80, 18, 80]);
      for (const y of [-30, 30]) piece(p, TUBE, C.shellDark, [0, y, 0], [76, 14, 76]);
      // A long curved guard down the outside of the forearm.
      piece(p, box, C.shellLight, [0, 6, 30], [34, FORE * 0.55, 14]);
      piece(p, TUBE, C.metal, [0, L - 92, 0], [92, 22, 92]);
      piece(g, TUBE, C.glow, [0, L - 70, 0], [70, 22, 70]);
    };
    const handGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      // Root-aligned, centred on the palm FIST_R above the ground: three claws splayed forward and a heel spur.
      piece(p, BALL, C.shell, [0, 6, 6], [118, 70, 126]);
      piece(p, box, C.shellLight, [0, 34, 0], [84, 18, 82], [0.2, 0, 0]);
      piece(p, TUBE, C.metal, [0, 30, -26], [80, 34, 80], [-0.6, 0, 0]);
      for (const a of [-0.55, 0, 0.55]) {
        const s = Math.sin(a);
        const c = Math.cos(a);
        const k: V3 = [s * 44, -6, c * 46];
        const mid: V3 = [s * 98, -38, c * 98];
        const tip: V3 = [s * 128, -FIST_R + 2, c * 128];
        strut(p, TUBE, C.shellDark, k, mid, 17);
        strut(p, spike, C.metal, mid, tip, 30);
        piece(p, NUB, C.metal, mid, [38, 38, 38]);
        piece(g, BALL, C.glow, k, [32, 32, 32]);
      }
      strut(p, spike, C.metal, [0, -14, -44], [0, -FIST_R + 2, -92], 30);
    };
    const thighGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      const L = THIGH / 2;
      piece(p, TUBE, C.shell, [0, 6, 0], [80, THIGH - 50, 80]);
      piece(g, BALL, C.glow, [0, -L, 0], [84, 84, 84]);
      piece(p, TUBE, C.metal, [0, -L + 42, 0], [104, 22, 104]);
      piece(p, TUBE, C.metal, [0, L - 26, 0], [98, 18, 98]);
    };
    const shinGeo = (p: THREE.BufferGeometry[], g: THREE.BufferGeometry[]) => {
      const L = SHIN / 2;
      piece(p, FLARE, C.shell, [0, 4, 0], [76, SHIN - 40, 76]);
      piece(g, BALL, C.glow, [0, -L, 0], [80, 80, 80]);
      piece(p, TUBE, C.metal, [0, -L + 36, 0], [98, 18, 98]);
      piece(p, box, C.shellLight, [0, 6, 40], [62, SHIN * 0.62, 18], [0.06, 0, 0]);
    };
    const footGeo = (p: THREE.BufferGeometry[]) => {
      // Root-aligned; the shin ends 22 below and 25 behind the centre. A broad flat oval pad, a domed cover, toes.
      piece(p, LENS, C.metal, [0, -6, 6], [184, 32, 226]);
      piece(p, BALL, C.shellDark, [0, 12, 0], [160, 44, 196]);
      for (const x of [-52, 0, 52]) piece(p, BALL, C.shell, [x, 0, 100], [56, 36, 54]);
      piece(p, BALL, C.metal, [0, 18, -25], [90, 76, 90]);
    };
    for (let i = 0; i < 2; i++) {
      this.limbArms.push({ upper: limb(upperGeo, UPPER), fore: limb(foreGeo, FORE), fist: limb(handGeo, 1) });
      this.legs.push({ thigh: limb(thighGeo, THIGH), shin: limb(shinGeo, SHIN), foot: limb(footGeo, 1) });
    }

    // Fire tendrils licking up from the exhaust stacks; Vent Burst whips one at a flyer.
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

  /** Eruption: both fists rise and slam the ground. */
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

    // The shoulders roll toward the planting fist; the body bobs twice a cycle and breathes when still.
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

    // Arms: walk on the fists, or strike, slam (Eruption), pound the chest (Roar), reach down (Leap).
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

    // Legs: short and planted, knees forward.
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1;
      const limb = side === 0 ? 3 : 1;
      const leg = this.legs[side]!;
      const g = limbSwing(f.cycle, limb);
      _foot.set(FOOT_AT.x * sx, g.lift * FOOT_LIFT * m, FOOT_AT.z + g.stride * A * m);
      if (f.airborne) _foot.set(sx * 150, 60, -60);
      mirror(HIP, sx, _hip).applyMatrix4(_rel);
      _pole.copy(_hip).add(_ref.set(sx * 30, 0, 300));
      solveTwoBone(_hip, _foot, THIGH, SHIN, _pole, _knee);
      placeLimb(leg.thigh, _hip, _knee, _ref);
      placeLimb(leg.shin, _knee, _foot, _ref);
      leg.foot.position.set(_foot.x, _foot.y + 22, _foot.z + 25);
      if (m > 0.3 && limbPlanted(f.prevCycle, f.cycle, limb)) onFootLand(_world.copy(_foot).setY(0).applyMatrix4(this.root.matrixWorld));
    }

    // Fire tendrils: solar-flare whips on the back; for Vent Burst the nearest one cocks back and cracks onto the flyer.
    const lashAt = f.antiAir ? this.root.worldToLocal(_aim.copy(f.antiAir.target)) : null;
    const hot = Math.max(f.heat, f.roaring ? 1 : 0);
    this.flares.update(f.dt, f.time, _rel, this.root.matrixWorld, lashAt, f.antiAir ? Math.min(1, f.antiAir.weight) : 0, hot, f.pose.collapse);

    // Glow: joints, seams, core and eyes pulse at rest and blaze with Molten Core heat.
    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    const pulse = 0.25 * Math.sin(f.time * 2.2);
    this.jointMat.emissiveIntensity = f.flash ? 3 : 0.9 + pulse + f.heat * 2.2 + (f.roaring ? 1.5 : 0);
    this.seamMat.emissiveIntensity = f.flash ? 2 : 0.35 + pulse * 0.5 + f.heat * 1.8 + (f.roaring ? 0.8 : 0);
    this.coreMat.emissiveIntensity = f.flash ? 3 : 1.2 + pulse + f.heat * 3;
    this.eyeMat.emissiveIntensity = 1 + f.heat * 2 + (f.roaring ? 2 : 0);
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

  /** Shots leave from the back vents in turn; the one used flares. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    const i = this.nextVent++ % this.vents.length;
    this.ventFlash[i] = 1;
    const v = this.vents[i]!;
    v.updateWorldMatrix(true, false);
    return v.getWorldPosition(out);
  }

  /** The first back vent. */
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
    this.seams.dispose();
    this.plants.dispose();
    this.flares.dispose();
  }
}
