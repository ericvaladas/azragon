import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';
import type { P3 } from './ospreyMath';

type ClothParams = typeof CONFIG.osprey.cloth;

/**
 * A body the cloth lands on: a frame (ground point and yaw; +X left, +Z forward) and its top surface, the height
 * above the frame's y at a frame-local (lx, lz), 0 where there is no body.
 */
export type ClothBody = { x: number; y: number; z: number; yaw: number; surface: (lx: number, lz: number) => number };

/**
 * What the cloth meets in one step: the ground height; the body it can land on (or none); whether rope landing on
 * the body at or above `catchMin` catches there (and then moves with the body); and a point to pull the free
 * cloth's centre over while it falls (or none).
 */
export type ClothEnv = { groundY: number; body: ClothBody | null; grip: boolean; catchMin: number; homeTo: Vec2 | null };

/**
 * A net as an n×n grid of points joined by ropes (to each neighbour along rows, columns and both diagonals), moved
 * by Verlet integration in fixed substeps. A heavier point feels proportionally less air drag and gives way less when
 * a rope pulls it, so weighted corners lead the fall and drag the net after them. Pinned points sit where they are told; caught points hold their place on
 * the body's frame; the rest fall, swing, and rest on the body and the ground.
 */
export class Cloth {
  readonly count: number;
  /** Any free point rested on the body / on the ground during the last step. */
  touchedBody = false;
  touchedGround = false;
  private pos: Float32Array;
  private prev: Float32Array;
  private pins: (P3 | null)[];
  private caught: Uint8Array;
  /** Caught points' frame-local positions (lx, height above the frame, lz). */
  private local: Float32Array;
  /** 1 / mass of each point. */
  private invMass: Float32Array;
  /** Gravity multiplier of each point (weights pull down harder than rope). */
  private pull: Float32Array;
  private links: Uint16Array;
  private rest: Float32Array;

  constructor(
    readonly n: number,
    spacing: number,
    private p: ClothParams = CONFIG.osprey.cloth,
  ) {
    this.count = n * n;
    this.pos = new Float32Array(this.count * 3);
    this.prev = new Float32Array(this.count * 3);
    this.pins = new Array<P3 | null>(this.count).fill(null);
    this.caught = new Uint8Array(this.count);
    this.local = new Float32Array(this.count * 3);
    this.invMass = new Float32Array(this.count).fill(1);
    this.pull = new Float32Array(this.count).fill(1);
    const pairs: number[] = [];
    const lens: number[] = [];
    const at = (i: number, j: number) => i + j * n;
    const diag = spacing * Math.SQRT2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (i + 1 < n) pairs.push(at(i, j), at(i + 1, j)), lens.push(spacing);
        if (j + 1 < n) pairs.push(at(i, j), at(i, j + 1)), lens.push(spacing);
        if (i + 1 < n && j + 1 < n) pairs.push(at(i, j), at(i + 1, j + 1), at(i + 1, j), at(i, j + 1)), lens.push(diag, diag);
      }
    }
    this.links = Uint16Array.from(pairs);
    this.rest = Float32Array.from(lens);
  }

  /** Places every point (row-major, as `write` gives them back), at rest. */
  layout(pts: readonly P3[]): void {
    for (let k = 0; k < this.count; k++) {
      const q = pts[k]!;
      this.pos[k * 3] = this.prev[k * 3] = q.x;
      this.pos[k * 3 + 1] = this.prev[k * 3 + 1] = q.y;
      this.pos[k * 3 + 2] = this.prev[k * 3 + 2] = q.z;
    }
  }

  /** Holds point `k` at `at` (moving it there each step), or lets it go with null. */
  pin(k: number, at: P3 | null): void {
    this.pins[k] = at ? { x: at.x, y: at.y, z: at.z } : null;
  }

  /** Makes point `k` a weight: `mass` × an ordinary point, pulled down at `pull` × gravity. */
  setWeight(k: number, mass: number, pull = 1): void {
    this.invMass[k] = 1 / mass;
    this.pull[k] = pull;
  }

  /** Lets go of every pin and every caught point. */
  release(): void {
    this.pins.fill(null);
    this.caught.fill(0);
  }

  caughtCount(): number {
    let c = 0;
    for (let k = 0; k < this.count; k++) c += this.caught[k]!;
    return c;
  }

  write(out: P3[]): void {
    for (let k = 0; k < this.count; k++) {
      const q = out[k]!;
      q.x = this.pos[k * 3]!;
      q.y = this.pos[k * 3 + 1]!;
      q.z = this.pos[k * 3 + 2]!;
    }
  }

  step(dt: number, env: ClothEnv): void {
    this.touchedBody = false;
    this.touchedGround = false;
    if (dt <= 0) return;
    const steps = Math.max(1, Math.ceil(dt / this.p.substep - 1e-9));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.substep(h, env);
  }

  private fixed(k: number): boolean {
    return this.pins[k] !== null || this.caught[k] === 1;
  }

  private substep(h: number, env: ClothEnv): void {
    const { pos, prev, p } = this;
    let ax = 0;
    let az = 0;
    if (env.homeTo) {
      // A damped spring pulls the free cloth's centre over the target.
      let cx = 0;
      let cz = 0;
      let vx = 0;
      let vz = 0;
      let m = 0;
      for (let k = 0; k < this.count; k++) {
        if (this.fixed(k)) continue;
        cx += pos[k * 3]!;
        cz += pos[k * 3 + 2]!;
        vx += pos[k * 3]! - prev[k * 3]!;
        vz += pos[k * 3 + 2]! - prev[k * 3 + 2]!;
        m++;
      }
      if (m > 0) {
        const w = p.homing;
        ax = w * w * (env.homeTo.x - cx / m) - (2 * w * vx) / m / h;
        az = w * w * (env.homeTo.z - cz / m) - (2 * w * vz) / m / h;
      }
    }
    const b = env.body;
    const c = b ? Math.cos(b.yaw) : 1;
    const sn = b ? Math.sin(b.yaw) : 0;
    const h2 = h * h;
    for (let k = 0; k < this.count; k++) {
      const o = k * 3;
      const pin = this.pins[k];
      if (pin || this.caught[k]) {
        prev[o] = pos[o]!;
        prev[o + 1] = pos[o + 1]!;
        prev[o + 2] = pos[o + 2]!;
        if (pin) {
          pos[o] = pin.x;
          pos[o + 1] = pin.y;
          pos[o + 2] = pin.z;
        } else if (b) {
          const lx = this.local[o]!;
          const lz = this.local[o + 2]!;
          pos[o] = b.x + lx * c + lz * sn;
          pos[o + 1] = b.y + this.local[o + 1]!;
          pos[o + 2] = b.z - lx * sn + lz * c;
        }
        continue;
      }
      const keep = 1 - (1 - p.damping) * this.invMass[k]!;
      const vx = (pos[o]! - prev[o]!) * keep;
      const vy = (pos[o + 1]! - prev[o + 1]!) * keep;
      const vz = (pos[o + 2]! - prev[o + 2]!) * keep;
      prev[o] = pos[o]!;
      prev[o + 1] = pos[o + 1]!;
      prev[o + 2] = pos[o + 2]!;
      pos[o] = pos[o]! + vx + ax * h2;
      pos[o + 1] = pos[o + 1]! + vy - p.gravity * this.pull[k]! * h2;
      pos[o + 2] = pos[o + 2]! + vz + az * h2;
    }
    for (let it = 0; it < p.iterations; it++) {
      this.tighten();
      this.collide(env, c, sn);
    }
  }

  /** Pulls each rope back toward its rest length, moving each end by its share of 1 / mass; fixed points do not move. */
  private tighten(): void {
    const { pos, links, rest, invMass } = this;
    for (let l = 0; l < rest.length; l++) {
      const a = links[l * 2]!;
      const b = links[l * 2 + 1]!;
      const fa = this.fixed(a) ? 0 : invMass[a]!;
      const fb = this.fixed(b) ? 0 : invMass[b]!;
      if (fa + fb === 0) continue;
      const dx = pos[b * 3]! - pos[a * 3]!;
      const dy = pos[b * 3 + 1]! - pos[a * 3 + 1]!;
      const dz = pos[b * 3 + 2]! - pos[a * 3 + 2]!;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-6) continue;
      const k = (d - rest[l]!) / d / (fa + fb);
      pos[a * 3] = pos[a * 3]! + dx * k * fa;
      pos[a * 3 + 1] = pos[a * 3 + 1]! + dy * k * fa;
      pos[a * 3 + 2] = pos[a * 3 + 2]! + dz * k * fa;
      pos[b * 3] = pos[b * 3]! - dx * k * fb;
      pos[b * 3 + 1] = pos[b * 3 + 1]! - dy * k * fb;
      pos[b * 3 + 2] = pos[b * 3 + 2]! - dz * k * fb;
    }
  }

  /** Lifts free points onto the body's top surface (unless they are deep under it) and the ground, with friction. */
  private collide(env: ClothEnv, c: number, sn: number): void {
    const { pos, prev, p } = this;
    const b = env.body;
    for (let k = 0; k < this.count; k++) {
      if (this.fixed(k)) continue;
      const o = k * 3;
      let hit = false;
      if (b) {
        const dx = pos[o]! - b.x;
        const dz = pos[o + 2]! - b.z;
        const lx = dx * c - dz * sn;
        const lz = dx * sn + dz * c;
        const top = b.surface(lx, lz);
        if (top > 0) {
          const want = b.y + top + p.thickness;
          const depth = want - pos[o + 1]!;
          if (depth > 0 && depth < p.maxPush) {
            pos[o + 1] = want;
            hit = true;
            this.touchedBody = true;
            if (env.grip && top >= env.catchMin) {
              this.caught[k] = 1;
              this.local[o] = lx;
              this.local[o + 1] = want - b.y;
              this.local[o + 2] = lz;
            }
          }
        }
      }
      if (pos[o + 1]! < env.groundY) {
        pos[o + 1] = env.groundY;
        hit = true;
        this.touchedGround = true;
      }
      if (hit) {
        // Contact slows sliding and stops the fall.
        prev[o] = pos[o]! - (pos[o]! - prev[o]!) * (1 - p.friction);
        prev[o + 1] = pos[o + 1]!;
        prev[o + 2] = pos[o + 2]! - (pos[o + 2]! - prev[o + 2]!) * (1 - p.friction);
      }
    }
  }
}
