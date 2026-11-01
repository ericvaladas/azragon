import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import type { EnemySystem, WorldContext } from './types';
import { escaped, fleePoint } from './retreat';

const B = CONFIG.blimp;
const MAX = CONFIG.spawns.blimp.cap;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

class Blimp implements Target {
  readonly kind = 'blimp' as const;
  readonly airborne = true;
  readonly radius = B.size * 0.45;
  readonly position = new THREE.Vector3();
  hp: number;
  alive = true;
  yaw = 0;
  flashT = 0;
  phase = Math.random() * 10;

  constructor(
    hp: number,
    private onDamage: (b: Blimp, amount: number) => void,
  ) {
    this.hp = hp;
  }

  isAlive(): boolean {
    return this.alive;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Kamikaze blimps: drift to the monster's head and detonate unless shot down first. While the army retreats they drift away instead. */
export class Blimps implements EnemySystem {
  readonly kind = 'blimp' as const;
  private blimps: Blimp[] = [];
  private envelope: THREE.InstancedMesh;
  private trim: THREE.InstancedMesh;
  private ctx: WorldContext | null = null;
  /** Local clock for the blinking light. */
  private clock = 0;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const env = faceted(new THREE.SphereGeometry(0.5, 10, 6)).scale(0.42, 0.42, 1);
    this.envelope = new THREE.InstancedMesh(env, toonMat(P.blimp), MAX);
    const trimGeo = mergeGeometries([
      faceted(new THREE.CylinderGeometry(0.215, 0.215, 0.1, 10)).rotateX(Math.PI / 2),
      faceted(new THREE.BoxGeometry(0.12, 0.08, 0.28)).translate(0, -0.25, 0),
      faceted(new THREE.BoxGeometry(0.02, 0.22, 0.14)).translate(0, 0.14, -0.44),
      faceted(new THREE.BoxGeometry(0.22, 0.02, 0.14)).translate(0, 0, -0.44),
    ])!;
    this.trim = new THREE.InstancedMesh(trimGeo, toonMat(0xffffff), MAX);
    for (const m of [this.envelope, this.trim]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      for (let i = 0; i < MAX; i++) m.setColorAt(i, _c.setHex(0xffffff));
      scene.add(m);
    }
  }

  targets(): readonly Target[] {
    return this.blimps;
  }

  count(): number {
    return this.blimps.length;
  }

  clear(): void {
    for (const b of this.blimps) b.alive = false;
    this.blimps = [];
    this.draw(0);
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.blimps.length >= MAX) return;
    const b = new Blimp(B.hp * ctx.difficulty.hpMult, this.damage);
    const d = ctx.spawnDir();
    const m = ctx.monster.position;
    b.position.set(m.x + d.x * B.spawnDist, B.altitude, m.z + d.z * B.spawnDist);
    this.blimps.push(b);
  }

  private damage = (b: Blimp, amount: number): void => {
    if (!b.alive) return;
    b.hp -= amount;
    b.flashT = 0.1;
    if (b.hp > 0) return;
    b.alive = false;
    if (!this.ctx?.quiet) this.ctx?.particles.explosion(b.position, 2.5);
    this.ctx?.onDestroyed(b, B.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const m = ctx.monster.position;
    _aim.set(m.x, B.headHeight * CONFIG.monster.scale, m.z);
    for (let i = this.blimps.length - 1; i >= 0; i--) {
      const b = this.blimps[i]!;
      if (!b.alive) {
        this.blimps.splice(i, 1);
        continue;
      }
      b.flashT = Math.max(0, b.flashT - dt);
      b.phase += dt;
      if (ctx.retreating === true) {
        if (escaped(b.position, m)) {
          b.alive = false;
          this.blimps.splice(i, 1);
          continue;
        }
        // Turns away from the monster at cruise speed and never detonates.
        const away = fleePoint(b.position, m, CONFIG.cycle.exitDistance + 200);
        _s.set(away.x - b.position.x, 0, away.z - b.position.z).normalize();
        b.position.addScaledVector(_s, B.speed * dt);
        b.position.y += Math.sin(b.phase * 1.3) * 6 * dt;
        b.yaw = Math.atan2(_s.x, _s.z);
        continue;
      }
      const d = b.position.distanceTo(_aim);
      if (d <= B.triggerDist && ctx.monster.alive) {
        b.alive = false;
        ctx.particles.explosion(b.position, 3.5);
        ctx.particles.ring('dust', b.position.clone().setY(0), 200, 16);
        ctx.shake(0.5);
        ctx.damageMonster(B.damage, 'blimp');
        this.blimps.splice(i, 1);
        continue;
      }
      const step = Math.min(d, B.speed * dt);
      b.position.addScaledVector(_s.subVectors(_aim, b.position).normalize(), step);
      b.position.y += Math.sin(b.phase * 1.3) * 6 * dt;
      b.yaw = Math.atan2(_aim.x - b.position.x, _aim.z - b.position.z);
    }
    this.clock += dt;
    this.draw(this.clock);
  }

  private draw(time: number): void {
    const P = CONFIG.palette;
    this.blimps.forEach((b, i) => {
      _q.setFromAxisAngle(UP, b.yaw);
      _m.compose(b.position, _q, _s.setScalar(B.size));
      this.envelope.setMatrixAt(i, _m);
      this.trim.setMatrixAt(i, _m);
      this.envelope.setColorAt(i, _c.setHex(b.flashT > 0 ? 0xffd0a0 : 0xffffff));
      const blink = Math.floor(time * 2 + b.phase) % 2 === 0;
      this.trim.setColorAt(i, _c.setHex(blink ? P.blimpTrim : P.blimpTrimDark));
    });
    for (const m of [this.envelope, this.trim]) {
      m.count = this.blimps.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
