import * as THREE from 'three';
import { CONFIG } from '../../config';
import { faceted, toonMat } from '../../render/toon';
import { angleDelta } from '../../util/math';
import type { BodyFrame, MonsterBody } from '../types';
import { ARM_COUNT, armAngle, armPlanted, armRole, crawlPhase, isFrontArm } from './crawl';
import { TentacleArms } from './TentacleArms';

const K = CONFIG.kraken;
const C = K.colors;
/** Segments per tentacle; all 8 × SEGS segments are one instanced mesh (one draw call). */
const SEGS = 7;
/** Model units (before CONFIG.monster.scale). */
const MANTLE_Y = 265;
const ANCHOR_R = 115;
const ANCHOR_Y = 170;
const REST_R = 470;
const PLANT_R = 560;
const LIFT = 140;
/** Resting tip height and the (negative) arch that sags the resting arm onto the ground before it curls up. */
const REST_CURL = 120;
const REST_ARCH = -170;
const MAX_TIP = 820;
const THICK = 62;

const _anchor = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ctrl = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, 1);
const _c = new THREE.Color();
const _tint = new THREE.Color();

/** Root-space point on the quadratic curve anchor → ctrl → tip at u. */
function curve(u: number, out: THREE.Vector3): THREE.Vector3 {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return out.set(
    a * _anchor.x + b * _ctrl.x + c * _tip.x,
    a * _anchor.y + b * _ctrl.y + c * _tip.y,
    a * _anchor.z + b * _ctrl.z + c * _tip.z,
  );
}

/**
 * The Kraken: a bulbous mantle carried low, two glowing eyes at the front (+Z), and eight tentacles. The
 * front four crawl (reach, plant, pull); free arms writhe and strike from `arms`; all eight spin for
 * Whirlpool, spread for Roar, coil when airborne, and sweep back in a Dash. +X is its left.
 */
export class KrakenBody implements MonsterBody {
  readonly root = new THREE.Group();
  readonly arms = new TentacleArms();
  private mantle = new THREE.Group();
  private segments: THREE.InstancedMesh;
  private segMat: THREE.MeshToonMaterial;
  private tintMats: THREE.MeshToonMaterial[];
  private eyeMat: THREE.MeshToonMaterial;
  private geos: THREE.BufferGeometry[] = [];
  private tipsLocal: THREE.Vector3[] = Array.from({ length: ARM_COUNT }, () => new THREE.Vector3());
  private nextLaunch = 0;

  constructor() {
    const skin = toonMat(C.mantle);
    const dark = toonMat(C.mantleDark);
    const under = toonMat(C.underside);
    this.eyeMat = toonMat(C.eye, { emissive: C.eye });
    const pupilMat = toonMat(0x140808);
    this.segMat = toonMat(0xffffff);
    this.tintMats = [skin, dark, under, this.segMat];
    const blob = this.keep(faceted(new THREE.IcosahedronGeometry(1, 1)));
    const box = this.keep(faceted(new THREE.BoxGeometry(1, 1, 1)));
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], size: [number, number, number], rotX = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...size);
      m.rotation.x = rotX;
      m.castShadow = true;
      m.receiveShadow = true;
      this.mantle.add(m);
      return m;
    };

    // Mantle: a big sac swept back and up behind a lower brow, mottled with raised spots, over a pale skirt
    // that the arm roots grow out of.
    const sac = add(blob, skin, [0, 75, -70], [165, 185, 205], 0.5);
    for (const [x, y, z, r] of [
      [0.55, 0.55, 0.3, 0.13], [-0.5, 0.6, -0.1, 0.11], [0.1, 0.85, -0.45, 0.12], [-0.6, 0.2, -0.6, 0.1],
      [0.7, 0.1, -0.5, 0.1], [0.15, 0.4, 0.8, 0.09], [-0.25, 0.95, 0.2, 0.1], [0.75, 0.45, -0.15, 0.08],
      [-0.75, 0.35, 0.35, 0.09], [0.35, 0.7, -0.75, 0.09], [-0.3, 0.55, -0.8, 0.11], [0.4, 0.95, 0.15, 0.08],
    ] as const) {
      const spot = new THREE.Mesh(blob, dark);
      spot.position.set(x, y, z).normalize().multiplyScalar(0.94);
      spot.scale.setScalar(r);
      sac.add(spot);
    }
    add(blob, skin, [0, -25, 40], [150, 95, 130]);
    add(blob, under, [0, -95, 15], [170, 60, 165]);
    // Eyes on the brow, looking forward and out, with the octopus's horizontal bar pupils.
    for (const side of [1, -1]) {
      const eye = add(blob, this.eyeMat, [side * 94, 0, 112], [44, 40, 32]);
      eye.rotation.y = side * 0.45;
      const pupil = add(box, pupilMat, [side * 106, 0, 141], [30, 8, 6]);
      pupil.rotation.y = side * 0.45;
      add(box, dark, [side * 90, 40, 112], [60, 12, 38]).rotation.z = side * -0.25;
    }
    this.mantle.position.y = MANTLE_Y;
    this.root.add(this.mantle);

    // Tentacles: one instanced mesh of tapered segments; colour per instance (top / dark band / pale tip).
    const seg = this.keep(faceted(new THREE.CylinderGeometry(0.72, 1, 1, 6)));
    this.segments = new THREE.InstancedMesh(seg, this.segMat, ARM_COUNT * SEGS);
    this.segments.castShadow = true;
    this.segments.receiveShadow = true;
    this.segments.frustumCulled = false;
    for (let i = 0; i < ARM_COUNT; i++) {
      for (let k = 0; k < SEGS; k++) {
        // Mantle-coloured roots fading to pale tips over the last three segments; a dark band at the root.
        const fade = Math.max(0, (k - (SEGS - 4)) / 3);
        this.segments.setColorAt(i * SEGS + k, _c.setHex(k === 0 ? C.mantleDark : C.mantle).lerp(_tint.setHex(C.underside), fade));
      }
    }
    this.root.add(this.segments);
  }

  private keep<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  animate(f: BodyFrame, onFootLand: (p: THREE.Vector3) => void): void {
    const moving = f.motion > 0.3;
    const S = K.stats.strideLength;
    // Two front arms pull per half cycle, so the mantle surges twice per cycle.
    const surge = moving ? Math.sin(f.cycle * Math.PI * 4) * f.motion : 0;
    const bob = surge * 12 + Math.sin(f.time * 1.2) * 8 - f.pose.dip - f.pose.collapse * 220;
    this.mantle.position.set(0, MANTLE_Y + bob, surge * 10);
    this.mantle.rotation.set(f.pose.pitch + 0.08 * f.motion + (f.roaring ? -0.35 : 0), 0, 0);
    const breathe = 1 + Math.sin(f.time * 1.2) * 0.02;
    this.mantle.scale.set(breathe, 1 / breathe, breathe);
    this.root.updateMatrixWorld(true);

    // Lash: the free arm whose anchor points most nearly at the flyer, kept for the whole swing
    // (reserved in `arms.lashArm` so no strike can take it) while it stays free in the crawl.
    let lashArm = -1;
    if (f.antiAir) {
      const kept = this.arms.lashArm;
      if (kept >= 0 && armRole(kept, f.cycle, moving) === 'free' && !this.arms.strikes[kept]) {
        lashArm = kept;
      } else {
        this.root.worldToLocal(_tmp.copy(f.antiAir.target));
        const bearing = Math.atan2(_tmp.x, _tmp.z);
        let best = Infinity;
        for (let i = 0; i < ARM_COUNT; i++) {
          if (armRole(i, f.cycle, moving) !== 'free' || this.arms.strikes[i]) continue;
          const d = Math.abs(angleDelta(armAngle(i), bearing));
          if (d < best) {
            best = d;
            lashArm = i;
          }
        }
      }
    }
    this.arms.lashArm = lashArm;

    for (let i = 0; i < ARM_COUNT; i++) {
      const role = armRole(i, f.cycle, moving);
      this.arms.roles[i] = role;
      const ang = armAngle(i);
      _dir.set(Math.sin(ang), 0, Math.cos(ang));
      _anchor.copy(_dir).multiplyScalar(ANCHOR_R).setY(ANCHOR_Y + bob);

      // Resting pose: curled around the mantle, writhing; back arms trail while crawling.
      const sway = Math.sin(f.time * 0.9 + i * 1.3) * 0.15;
      _rest.set(Math.sin(ang + sway), 0, Math.cos(ang + sway)).multiplyScalar(REST_R + Math.sin(f.time * 1.3 + i * 1.7) * 40);
      _rest.y = REST_CURL + Math.max(0, Math.sin(f.time * 1.1 + i)) * 60;
      if (moving && !isFrontArm(i)) _rest.addScaledVector(_fwd, -S * 0.25 * f.motion);
      _tip.copy(_rest);
      // Resting arms sag onto the ground and curl their tips up.
      let arch = REST_ARCH;

      if (role !== 'free') {
        // Crawl: plant ahead, slide back under the mantle (world-still), then lift and reach forward again.
        const p = crawlPhase(i, f.cycle);
        _p0.copy(_dir).multiplyScalar(PLANT_R).addScaledVector(_fwd, S / 4);
        _p1.copy(_dir).multiplyScalar(PLANT_R).addScaledVector(_fwd, -S / 4);
        if (role === 'pull') _tip.lerpVectors(_p0, _p1, p / 0.5);
        else {
          const u = (p - 0.5) / 0.5;
          _tip.lerpVectors(_p1, _p0, u);
          _tip.y = LIFT * Math.sin(Math.PI * u);
        }
        arch = 120;
      }

      const s = this.arms.strikes[i];
      if (s) {
        const T = s.timing;
        this.root.worldToLocal(_b.copy(s.target));
        _b.y = 0;
        if (s.kind === 'slam') _a.copy(_dir).multiplyScalar(PLANT_R * 0.55).setY(560);
        else _a.set(0, 680, -120);
        if (s.kind === 'hurl') _p0.copy(_dir).multiplyScalar(PLANT_R * 0.6);
        if (s.t < T.windup) {
          // Slam: rear up; Hurl: reach down to grab rubble.
          _tip.lerpVectors(_rest, s.kind === 'slam' ? _a : _p0, s.t / T.windup);
        } else if (s.t < T.impact) {
          const u = (s.t - T.windup) / (T.impact - T.windup);
          if (s.kind === 'slam') _tip.lerpVectors(_a, _b, u * u);
          else _tip.lerpVectors(_p0, _a, u);
        } else {
          const u = Math.min(1, (s.t - T.impact) / (T.end - T.impact));
          _tip.lerpVectors(s.kind === 'slam' ? _b : _a, _rest, u);
        }
        arch = 260;
      }
      if (this.arms.spinT >= 0) {
        const k = this.arms.spinT / K.arms.spinTime;
        const sa = ang + k * Math.PI * 2;
        _tip.set(Math.sin(sa) * PLANT_R * 1.1, 40 + Math.sin(Math.PI * k) * 120, Math.cos(sa) * PLANT_R * 1.1);
        arch = 60;
      }
      if (f.roaring) {
        _tip.copy(_dir).multiplyScalar(REST_R * 1.05).setY(260);
        arch = 200;
      }
      if (f.dashing) {
        _tip.copy(_dir).multiplyScalar(REST_R * 0.7).addScaledVector(_fwd, -300).setY(40);
        arch = 60;
      }
      if (f.airborne) _tip.copy(_dir).multiplyScalar(REST_R * 0.6).setY(-120);
      if (i === lashArm && f.antiAir) {
        this.root.worldToLocal(_b.copy(f.antiAir.target));
        _tip.lerp(_b, Math.max(0, Math.min(1, f.antiAir.weight)));
        arch = 40;
      }
      if (f.pose.collapse > 0) _tip.multiplyScalar(1 + f.pose.collapse * 0.15).setY(_tip.y * (1 - f.pose.collapse));
      // Never stretch past the arm's length.
      _tmp.copy(_tip).sub(_anchor);
      if (_tmp.length() > MAX_TIP) _tip.copy(_anchor).add(_tmp.setLength(MAX_TIP));

      // Arched chain anchor → tip, drawn as SEGS tapered instances.
      _ctrl.addVectors(_anchor, _tip).multiplyScalar(0.5).addScaledVector(_dir, 40);
      _ctrl.y += arch;
      for (let k = 0; k < SEGS; k++) {
        curve(k / SEGS, _a);
        curve((k + 1) / SEGS, _b);
        _tmp.subVectors(_b, _a);
        const len = _tmp.length();
        _q.setFromUnitVectors(_up, _tmp.divideScalar(Math.max(len, 1e-6)));
        const r = THICK * (1 - 0.78 * (k / SEGS));
        _m.compose(_tmp.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(r, len, r));
        this.segments.setMatrixAt(i * SEGS + k, _m);
      }

      this.tipsLocal[i]!.copy(_tip);
      this.root.localToWorld(this.arms.tips[i]!.copy(_tip));
      if (moving && !this.arms.strikes[i] && this.arms.spinT < 0 && i !== lashArm && armPlanted(f.prevCycle, f.cycle, i)) onFootLand(_tmp.copy(this.arms.tips[i]!).setY(0));
    }
    this.segments.instanceMatrix.needsUpdate = true;

    for (const mat of this.tintMats) {
      if (f.flash) mat.emissive.setHex(0xffffff);
      else mat.emissive.setHex(CONFIG.levelUp.color).multiplyScalar(f.glow);
    }
    this.eyeMat.emissiveIntensity = f.flash ? 3 : 1 + (f.roaring ? 2 : 0);
  }

  /** Hurls launch from the arm tips themselves; Barrage, Deep Throw and Ink Cloud use free arms in turn. */
  launchOrigin(out: THREE.Vector3): THREE.Vector3 {
    for (let n = 0; n < ARM_COUNT; n++) {
      const i = (this.nextLaunch + n) % ARM_COUNT;
      if (this.arms.roles[i] === 'free' && !this.arms.strikes[i]) {
        this.nextLaunch = i + 1;
        return out.copy(this.arms.tips[i]!).setY(this.arms.tips[i]!.y + 40);
      }
    }
    return this.rangedOrigin(out);
  }

  /** Top of the mantle. */
  rangedOrigin(out: THREE.Vector3): THREE.Vector3 {
    this.mantle.updateWorldMatrix(true, false);
    return this.mantle.localToWorld(out.set(0, 160, -40));
  }

  aimError(): number {
    return 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.segments.dispose();
  }
}
