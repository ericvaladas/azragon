import * as THREE from 'three';
import { CONFIG } from '../../config';
import { painted, toonMat } from '../../render/toon';
import { solveTwoBone } from '../../monster/ik';
import type { BodyFrame, MonsterBody } from '../types';
import { fistKind, lungeAmount, lungeWeight, strikeReturn, strikeStarted, type FistKind } from './fist';
import { FireTendrils } from './FireTendrils';
import { furRing, glyph, glyphMatrices, merge, partMatrix, piece, rng, SHAPES, tuftGeometry, type Seg, type V3 } from './golemParts';
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
/** Back vents (torso space): Magma Lob, Ember Storm and Pyroclast leave from these in turn. */
const BACK_VENTS: readonly (readonly [number, number, number])[] = [
  [85, 690, -75],
  [-85, 690, -75],
  [0, 682, -185],
];
/** Fire tendrils (torso space): roots on the back hump, each rising away from the hump's centre. */
const TENDRIL_ROOTS: readonly THREE.Vector3[] = [
  new THREE.Vector3(140, 650, -20),
  new THREE.Vector3(-140, 650, -20),
  new THREE.Vector3(50, 700, -10),
  new THREE.Vector3(-50, 700, -10),
  new THREE.Vector3(0, 685, -130),
];
const HUMP_CENTRE = new THREE.Vector3(0, 520, -40);
/** Which edge of a plate's face a fur fringe hangs from: −Y, +X or −X of its face. */
type Edge = 'b' | 'r' | 'l';
/**
 * Carved stone armour slabs (torso space). `p` centre, `s` width × height × thickness (the face is local +Z),
 * `r` tilt/turn/roll (see partMatrix), `dark` for the deeper stone, `g` magma glyphs carved into the face,
 * `fringe` the edges fur hangs from, `pair` for a left-side slab mirrored onto the right.
 */
type Plate = { p: V3; s: V3; r: V3; dark?: boolean; g?: readonly Seg[]; fringe?: readonly Edge[]; pair?: boolean };
const UP = -Math.PI / 2;
/** Chest plate: the Molten Core sigil sits on its face. */
const CHEST: Plate = {
  p: [0, 322, 232],
  s: [250, 172, 46],
  r: [0.3, 0, 0],
  g: [...glyph.diamond(0, 4, 62), [62, 4, 112, 4], [-62, 4, -112, 4], [0, -58, 0, -86], [0, 66, 0, 86], ...glyph.steps(-118, -86, 2, 22, 22), ...glyph.mirrorX(glyph.steps(-118, -86, 2, 22, 22))],
  fringe: ['b'],
};
const PLATES: readonly Plate[] = [
  CHEST,
  { p: [0, 314, 214], s: [286, 204, 30], r: [0.3, 0, 0], dark: true },
  // Loin slab between the legs.
  { p: [0, 200, 76], s: [118, 104, 30], r: [0.12, 0, 0], dark: true, g: [[0, 34, 0, -28], [-26, -8, 26, -8]], fringe: ['b'] },
  // Belly flanks and upper flanks.
  { p: [224, 350, 34], s: [150, 136, 32], r: [0, Math.PI / 2, 0.2], dark: true, g: [...glyph.steps(-52, -42, 3, 26, 26), [40, -42, 40, 40]], fringe: ['b'], pair: true },
  { p: [276, 520, -52], s: [170, 128, 30], r: [0, Math.PI / 2, 0.32], g: [...glyph.rect(0, 0, 120, 80), ...glyph.diamond(0, 0, 22)], fringe: ['b'], pair: true },
  // Pauldrons: a carved top slab on a broader dark one.
  { p: [222, 632, 72], s: [176, 166, 40], r: [UP, 0, -0.45], g: [...glyph.diamond(0, 0, 50), ...glyph.diamond(0, 0, 18)], fringe: ['r', 'b'], pair: true },
  { p: [244, 600, 74], s: [204, 190, 30], r: [UP, 0, -0.75], dark: true, fringe: ['r'], pair: true },
  // Back: a spine slab and two side slabs on the hump, a big carved slab across the back, a lower one above the hips.
  { p: [0, 678, -36], s: [96, 150, 30], r: [UP + 0.15, 0, 0], g: [[0, -56, 0, 56], [-26, -28, 26, -28], [-26, 8, 26, 8], [-26, 44, 26, 44]] },
  { p: [152, 650, -72], s: [128, 196, 32], r: [UP + 0.1, 0, -0.45], g: glyph.steps(-42, -70, 4, 22, 34), fringe: ['r'], pair: true },
  { p: [0, 556, -264], s: [236, 172, 40], r: [-0.25, Math.PI, 0], g: [...glyph.spiral(0, 0, 62, 2, 26), [62 + 28, -62, 62 + 28, 62], [-62 - 28, -62, -62 - 28, 62]], fringe: ['b'] },
  { p: [0, 398, -224], s: [192, 120, 34], r: [-0.1, Math.PI, 0], dark: true, g: [...glyph.steps(-84, -36, 3, 22, 22), ...glyph.mirrorX(glyph.steps(-84, -36, 3, 22, 22))], fringe: ['b'] },
  // Helmet-mask face.
  { p: [0, 460, 294], s: [100, 96, 16], r: [0.12, 0, 0], g: [[0, -6, 0, -30], [-20, -36, 0, -46], [0, -46, 20, -36]] },
];
/** Fur (torso space): ellipsoid patches the tufts grow from: centre, radii, X tilt, count. */
const FUR: readonly (readonly [V3, V3, number, number])[] = [
  [[0, 520, -30], [280, 165, 240], 0.15, 230],
  [[0, 590, -60], [200, 90, 180], 0.1, 40],
  [[200, 500, 70], [140, 125, 140], 0, 55],
  [[-200, 500, 70], [140, 125, 140], 0, 55],
  [[0, 380, 20], [230, 180, 200], 0.3, 60],
  [[0, 250, -110], [150, 110, 140], 0, 30],
];
const F_MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
const _rel = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _n = new THREE.Vector3();
const _at = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _nrm = new THREE.Vector3();
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

/**
 * Stretch a height-1, centred limb mesh from a to b (like placeSegment), turned about its axis so its local +Z
 * leans toward `ref` (the IK bend direction): a stable twist, so the carved bracers and guards never spin.
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
 * The Magma Golem: a hunched colossus of shaggy dark fur under ancient carved stone armour (chest plate, back
 * slabs, pauldrons, bracers, shin guards, stone-capped fists) whose magma glyphs glow, a Molten Core sigil on its
 * chest, a small stone helmet-mask sunk between its shoulders, huge arms it knuckle-walks on and short thick legs. Back vents lob magma; fire tendrils
 * flare from its back and whip at flyers. Faces +Z; +X is its left.
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
  /** One vertex-coloured material for all fur and stone (and the tufts, tinted per instance). */
  private bodyMat: THREE.MeshToonMaterial;
  private glyphMat: THREE.MeshToonMaterial;
  private coreMat: THREE.MeshToonMaterial;
  private eyeMat: THREE.MeshToonMaterial;
  private glyphs!: THREE.InstancedMesh;
  private tufts!: THREE.InstancedMesh;
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
    this.glyphMat = toonMat(C.glyph, { emissive: C.glyph });
    this.coreMat = toonMat(C.core, { emissive: C.core });
    this.eyeMat = toonMat(C.eye, { emissive: C.eye });
    this.tintMats = [this.bodyMat];
    const { box, blob, boulder, collar } = SHAPES;
    const torso: THREE.BufferGeometry[] = [];
    const glyphs: THREE.Matrix4[] = [];
    const tufts: { m: THREE.Matrix4; c: number }[] = [];
    const rand = rng(7);
    const furTones = [C.fur, C.furDark, C.fur, C.furLight];
    const tuft = (at: THREE.Vector3, dir: THREE.Vector3, len: number, wide: number) => {
      _q.setFromUnitVectors(_down, dir.normalize());
      _q.multiply(_q2.setFromAxisAngle(_down, rand() * Math.PI * 2));
      tufts.push({ m: new THREE.Matrix4().compose(at.clone(), _q.clone(), _s.set(wide, len, wide).clone()), c: furTones[Math.floor(rand() * furTones.length)]! });
    };

    // Shaggy fur body: hips, belly, a hunched back with a hump, shoulders.
    piece(torso, blob, C.furDark, [0, 250, -110], [150, 110, 140]);
    piece(torso, blob, C.fur, [0, 380, 20], [230, 180, 200], [0.3, 0, 0]);
    piece(torso, blob, C.furDark, [0, 520, -30], [280, 165, 240], [0.15, 0, 0]);
    piece(torso, blob, C.furDark, [0, 590, -60], [200, 90, 180], [0.1, 0, 0]);
    for (const sx of [1, -1]) piece(torso, blob, C.furDark, [sx * 200, 500, 70], [140, 125, 140]);
    // Plate frames (inverse, both sides), so tufts rooted under an upright slab do not poke through its carved face.
    const under = PLATES.flatMap((pl) => {
      const M = partMatrix(pl.p, pl.r, [1, 1, 1]);
      if (_nrm.set(0, 0, 1).transformDirection(M).y > 0.5) return [];
      const ms = pl.pair ? [M, M.clone().premultiply(F_MIRROR).multiply(F_MIRROR)] : [M];
      return ms.map((m) => ({ inv: m.clone().invert(), s: pl.s }));
    });
    const hidden = (p: THREE.Vector3) =>
      under.some(({ inv, s }) => {
        _tmp.copy(p).applyMatrix4(inv);
        return Math.abs(_tmp.x) < s[0] / 2 + 10 && Math.abs(_tmp.y) < s[1] / 2 && _tmp.z < s[2] / 2 && _tmp.z > -s[2] / 2 - 90;
      });
    for (const [c, r, tilt, n] of FUR) {
      _rot.makeRotationX(tilt);
      for (let i = 0; i < n; i++) {
        // Uniform direction on the sphere, then onto the ellipsoid; the tuft hangs down and a little outward.
        const z = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const k = Math.sqrt(1 - z * z);
        _n.set(k * Math.cos(a), k * Math.sin(a), z);
        _at.set(_n.x * r[0], _n.y * r[1], _n.z * r[2]).multiplyScalar(0.95).applyMatrix4(_rot).add(_tmp.set(c[0], c[1], c[2]));
        _dir.set(_n.x / r[0], _n.y / r[1], _n.z / r[2]).applyMatrix4(_rot).normalize();
        // No fur under the chest plate or over the face.
        if (_at.z > 130 && Math.abs(_at.x) < 105 && _at.y < 530) continue;
        if (_dir.y < -0.75 || hidden(_at)) continue;
        // Lie along the surface, flowing downhill (a pelt), lifted a little off it.
        _tmp.set((rand() - 0.5) * 0.5, -1, (rand() - 0.5) * 0.5);
        _tmp.addScaledVector(_dir, -_tmp.dot(_dir));
        if (_tmp.lengthSq() < 0.05) _tmp.set(rand() - 0.5, 0, rand() - 0.5);
        _dir.multiplyScalar(0.75).add(_tmp.normalize());
        tuft(_at, _dir, 64 + rand() * 50, 44 + rand() * 18);
      }
    }

    // Stone armour slabs with magma glyphs; fur hangs from their edges.
    for (const pl of PLATES) {
      const M = partMatrix(pl.p, pl.r, [1, 1, 1]);
      const sides = pl.pair ? [M, M.clone().premultiply(F_MIRROR).multiply(F_MIRROR)] : [M];
      for (const S of sides) piece(torso, box, pl.dark ? C.stoneDark : C.stone, [0, 0, 0], pl.s, [0, 0, 0], S);
      const g: THREE.Matrix4[] = [];
      if (pl.g) glyphMatrices(M, pl.s[2], pl.g, g);
      for (const gm of g) {
        glyphs.push(gm);
        if (pl.pair) glyphs.push(gm.clone().premultiply(F_MIRROR).multiply(F_MIRROR));
      }
      _nrm.set(0, 0, 1).transformDirection(M);
      for (const e of pl.fringe ?? []) {
        const [w, h, d] = pl.s;
        const along = e === 'b' ? w : h;
        const n = Math.max(2, Math.round(along / 34));
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n - 0.5;
          if (e === 'b') _at.set(u * along, -h / 2 + 6, -d / 4);
          else _at.set((e === 'r' ? 1 : -1) * (w / 2 - 6), u * along, -d / 4);
          _at.applyMatrix4(M);
          _dir.copy(_nrm).multiplyScalar(0.25).add(_tmp.set((rand() - 0.5) * 0.3, -1, (rand() - 0.5) * 0.3));
          const len = 60 + rand() * 40;
          const wide = 34 + rand() * 12;
          tuft(_at, _dir, len, wide);
          if (pl.pair) tuft(_at.setX(-_at.x), _dir.setX(-_dir.x), len, wide);
        }
      }
    }

    // A small stone helmet-mask sunk between the shoulders: brow, cheek guards, a crest, slit eyes, a fur beard.
    piece(torso, box, C.stone, [0, 476, 236], [116, 104, 108]);
    piece(torso, box, C.stoneDark, [0, 506, 300], [128, 22, 30], [0.1, 0, 0]);
    piece(torso, box, C.stoneDark, [0, 542, 246], [18, 44, 100], [-0.2, 0, 0]);
    piece(torso, box, C.stone, [0, 530, 196], [14, 30, 60], [-0.1, 0, 0]);
    for (const sx of [1, -1]) piece(torso, box, C.stoneDark, [sx * 62, 456, 274], [16, 78, 66]);
    const eyes: THREE.BufferGeometry[] = [];
    for (const sx of [1, -1]) piece(eyes, box, C.eye, [sx * 26, 488, 304], [34, 9, 10], [0.12, 0, sx * 0.18]);
    for (let i = 0; i < 11; i++) {
      const u = i / 10 - 0.5;
      tuft(_at.set(u * 96, 420 - Math.abs(u) * 30, 284 + rand() * 10), _dir.set(u * 0.6, -1, 0.5), 52 + (0.5 - Math.abs(u)) * 50 + rand() * 14, 34);
    }

    // The Molten Core: a glowing rhombus at the heart of the chest plate's sigil.
    const core: THREE.BufferGeometry[] = [];
    const chest = partMatrix(CHEST.p, CHEST.r, [1, 1, 1]);
    piece(core, box, C.core, [0, 4, CHEST.s[2] / 2 + 2], [58, 58, 16], [0, 0, Math.PI / 4], chest);
    piece(core, box, C.core, [0, 4, CHEST.s[2] / 2 + 8], [26, 26, 10], [0, 0, Math.PI / 4], chest);

    // Back vents: ruined stone chimneys around glowing throats; `mouth` is where shots leave.
    const throat = this.keep(new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2));
    BACK_VENTS.forEach(([x, y, z], i) => {
      const vent = new THREE.Object3D();
      vent.position.set(x, y, z);
      vent.rotation.set(-0.35, 0, -Math.sign(x) * 0.3);
      vent.updateMatrix();
      piece(torso, collar, C.stoneDark, [0, -10, 0], [44, 90, 44], [0, 0, 0], vent.matrix);
      // A broken rim: three of four walls, of uneven heights.
      for (let k = 0; k < 3; k++) {
        const a = k * (Math.PI / 2) + 0.4 + i;
        const h = [40, 18, 48][(k + i) % 3]!;
        piece(torso, box, k % 2 ? C.stoneDark : C.stone, [Math.sin(a) * 38, 26 + h / 2, Math.cos(a) * 38], [88, h, 18], [0, a, 0], vent.matrix);
      }
      const mat = toonMat(C.magma, { emissive: C.magma });
      this.ventMats.push(mat);
      this.ventFlash.push(0);
      this.mesh(vent, throat, mat, false).position.set(0, 35.5, 0);
      vent.children[0]!.scale.set(30, 1, 30);
      const mouth = new THREE.Object3D();
      mouth.position.set(0, 55, 0);
      vent.add(mouth);
      this.vents.push(mouth);
      this.shell.add(vent);
    });

    this.mesh(this.shell, this.keep(merge(torso)), this.bodyMat);
    this.mesh(this.shell, this.keep(merge(core)), this.coreMat, false);
    this.mesh(this.shell, this.keep(merge(eyes)), this.eyeMat, false);
    this.glyphs = new THREE.InstancedMesh(box, this.glyphMat, glyphs.length);
    glyphs.forEach((m, i) => this.glyphs.setMatrixAt(i, m));
    this.shell.add(this.glyphs);
    const tuftGeo = this.keep(tuftGeometry());
    this.tufts = new THREE.InstancedMesh(tuftGeo, this.bodyMat, tufts.length);
    tufts.forEach((t, i) => {
      this.tufts.setMatrixAt(i, t.m);
      this.tufts.setColorAt(i, _col.setHex(t.c));
    });
    this.tufts.castShadow = true;
    this.tufts.receiveShadow = true;
    this.shell.add(this.tufts);

    this.shell.position.copy(PIVOT).multiplyScalar(-1);
    this.body.add(this.shell);
    this.root.add(this.body);

    // Limbs (root space; placed by IK every frame): furry upper arms and thighs, stone bracers, shin guards, fists, feet.
    const limb = (build: (parts: THREE.BufferGeometry[], glyph: THREE.Matrix4[]) => void, len: number) => {
      const parts: THREE.BufferGeometry[] = [];
      const gm: THREE.Matrix4[] = [];
      build(parts, gm);
      const m = this.mesh(this.root, this.keep(merge(parts).scale(1, 1 / len, 1)), this.bodyMat);
      if (gm.length) {
        const gp: THREE.BufferGeometry[] = [];
        for (const g of gm) gp.push(painted(box.clone().applyMatrix4(g), C.glyph));
        this.mesh(m, this.keep(merge(gp).scale(1, 1 / len, 1)), this.glyphMat, false);
      }
      return m;
    };
    const upperGeo = (p: THREE.BufferGeometry[]) => {
      piece(p, SHAPES.limb, C.fur, [0, 0, 0], [112, UPPER, 116]);
      [-0.4, -0.16, 0.08, 0.3].forEach((y, k) => furRing(p, furTones, 7, y * UPPER, 50, 88, 36, 0.5, k * 0.45));
    };
    const foreGeo = (p: THREE.BufferGeometry[], g: THREE.Matrix4[]) => {
      piece(p, SHAPES.hex, C.fur, [0, -72, 0], [104, 130, 104]);
      [-118, -80].forEach((y, k) => furRing(p, furTones, 7, y, 46, 70, 32, 0.5, k * 0.45));
      piece(p, SHAPES.hex, C.stone, [0, 50, 0], [142, 140, 142]);
      piece(p, SHAPES.hex, C.stoneDark, [0, -22, 0], [156, 20, 156]);
      piece(p, SHAPES.hex, C.stoneDark, [0, 118, 0], [156, 20, 156]);
      furRing(p, furTones, 8, -40, 50, 62, 32, 0.6, 0.2);
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const face = partMatrix([Math.sin(a) * 61.5, 50, Math.cos(a) * 61.5], [0, a, 0], [1, 1, 1]);
        glyphMatrices(face, 0, k % 2 ? [[0, -40, 0, 40], [-14, -10, 14, -10], [-14, 18, 14, 18]] : [[-12, -40, -12, 0], [-12, 0, 12, 0], [12, 0, 12, 40]], g, 11);
      }
    };
    const fistGeo = (p: THREE.BufferGeometry[], g: THREE.Matrix4[]) => {
      const R = FIST_R;
      piece(p, boulder, C.stoneDark, [0, -6, 0], [R * 1.32, R * 0.95, R * 1.22]);
      const cap = partMatrix([0, R * 0.6, -4], [UP + 0.12, 0.25, 0.06], [1, 1, 1]);
      piece(p, box, C.stone, [0, 0, 0], [R * 1.45, R * 1.25, R * 0.4], [0, 0, 0], cap);
      glyphMatrices(cap, R * 0.4, [...glyph.diamond(0, 0, 30), [0, -10, 0, 10]], g, 11);
      const knuckle = partMatrix([0, 4, R * 0.74], [0.25, 0, 0], [1, 1, 1]);
      piece(p, box, C.stone, [0, 0, 0], [R * 1.22, R * 0.55, R * 0.32], [0, 0, 0], knuckle);
      glyphMatrices(knuckle, R * 0.32, [[-38, 0, 38, 0]], g, 10);
      for (const sx of [1, -1]) piece(p, box, C.stoneDark, [sx * R * 0.66, -4, 0], [R * 0.3, R * 0.6, R * 0.9], [0, 0, sx * 0.2]);
    };
    const thighGeo = (p: THREE.BufferGeometry[]) => {
      piece(p, SHAPES.limb, C.fur, [0, 0, 0], [94, THIGH, 98]);
      [-0.36, -0.08, 0.2, 0.42].forEach((y, k) => furRing(p, furTones, 7, y * THIGH, 44, 72, 34, 0.5, k * 0.5));
    };
    const shinGeo = (p: THREE.BufferGeometry[], g: THREE.Matrix4[]) => {
      piece(p, SHAPES.hex, C.stoneDark, [0, 10, 0], [104, 124, 104]);
      const guard = partMatrix([0, 8, 42], [-0.06, 0, 0], [1, 1, 1]);
      piece(p, box, C.stone, [0, 0, 0], [96, 128, 24], [0, 0, 0], guard);
      glyphMatrices(guard, 24, [[0, -46, 0, 30], [-24, 16, 0, 40], [0, 40, 24, 16]], g, 11);
      furRing(p, furTones, 8, -66, 46, 64, 34, 0.55, 0.3);
    };
    const footGeo = (p: THREE.BufferGeometry[]) => {
      piece(p, box, C.stoneDark, [0, 0, 0], [104, 44, 134]);
      for (const x of [-34, 0, 34]) piece(p, box, C.stone, [x, -4, 70], [30, 34, 28], [0, 0, 0]);
      piece(p, box, C.stone, [0, 26, 6], [90, 16, 104], [0.08, 0, 0]);
    };
    for (let i = 0; i < 2; i++) {
      this.limbArms.push({ upper: limb(upperGeo, UPPER), fore: limb(foreGeo, FORE), fist: limb(fistGeo, 1) });
      this.legs.push({ thigh: limb(thighGeo, THIGH), shin: limb(shinGeo, SHIN), foot: limb(footGeo, 1) });
    }

    // Fire tendrils licking up from the back; Vent Burst whips one at a flyer.
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

    // Glow: glyphs, core and eyes pulse at rest and blaze with Molten Core heat.
    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    const pulse = 0.25 * Math.sin(f.time * 2.2);
    this.glyphMat.emissiveIntensity = f.flash ? 3 : 0.9 + pulse + f.heat * 2.2 + (f.roaring ? 1.5 : 0);
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
    this.glyphs.dispose();
    this.tufts.dispose();
    this.flares.dispose();
  }
}
