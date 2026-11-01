import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';
import { rotateToward } from './aimMath';
import { beamHits } from './beamMath';
import type { MechLaserPhase } from './mechMath';
import type { WorldContext } from './types';

const M = CONFIG.mech;
/** Points sampled along a firing beam for building damage; their spacing stays under twice laserHitRadius. */
const BEAM_SAMPLES = 16;
const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _body = new THREE.Vector3();
const _to = new THREE.Vector3();
const _p = new THREE.Vector3();
const _spot: Vec2 = { x: 0, z: 0 };
const lerp = THREE.MathUtils.lerp;

/** The monster's body point the beam aims at and is tested against, the same one the laser trucks use. */
function bodyPoint(monster: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(monster.x, monster.y + CONFIG.truck.aimHeight * CONFIG.monster.scale, monster.z);
}

/**
 * The mech's face laser: the swelling eye, the charge's sparks and streaks, the thin aim line and the thick beam, and
 * what the beam hits. Everything is drawn with one set of reused meshes, and starts at the eye's world position. A firing
 * beam hits the monster's body point in 3D, so a monster that leaps high enough above the line is out of it.
 */
export class MechLaser {
  /** Unit direction of the line (world space). */
  readonly aim = new THREE.Vector3(0, 0, 1);
  /** The line's ends: it runs from the eye for laserLength, or to the ground if that comes first. */
  readonly start = new THREE.Vector3();
  readonly end = new THREE.Vector3();
  /** The phase last updated; null when nothing is showing. */
  phase: MechLaserPhase | null = null;
  /** The charge's streaks, in eye-relative coordinates: each streak is a head vertex then a tail vertex. */
  readonly streaks: THREE.LineSegments;
  private readonly line: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly flare: THREE.Mesh;
  private readonly streakDirs = new Float32Array(M.laserStreaks[1] * 3);
  private readonly streakReach = new Float32Array(M.laserStreaks[1]);
  private readonly streakAge = new Float32Array(M.laserStreaks[1]);
  private readonly streakLife = new Float32Array(M.laserStreaks[1]);
  private readonly streakPos = new THREE.BufferAttribute(new Float32Array(M.laserStreaks[1] * 6), 3);
  private readonly streakColor = new THREE.BufferAttribute(new Float32Array(M.laserStreaks[1] * 8), 4);
  /** Seconds until the next charge spark, and until the next burn effect at the beam's end. */
  private fxT = 0;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const glow = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const unit = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
    // Both are transparent and leave depth alone, so the core draws over the sheath around it.
    this.line = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: P.mechBeam, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.core = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: P.mechBeamCore, transparent: true, depthWrite: false, fog: false }));
    this.flare = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), glow(P.mechBeam));
    const c = new THREE.Color(P.mechBeam);
    for (let i = 0; i < this.streakColor.count; i++) this.streakColor.setXYZW(i, c.r, c.g, c.b, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', this.streakPos);
    g.setAttribute('color', this.streakColor);
    this.streaks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    for (const o of [this.line, this.core, this.flare, this.streaks]) {
      o.frustumCulled = false;
      o.visible = false;
      scene.add(o);
    }
    this.line.renderOrder = 4;
    this.core.renderOrder = 5;
    this.flare.renderOrder = 6;
    this.streaks.renderOrder = 7;
  }

  /** Anything of the laser is showing. */
  get visible(): boolean {
    return this.line.visible || this.core.visible || this.flare.visible || this.streaks.visible;
  }

  /** Hides everything at once and forgets the shot. */
  hide(): void {
    this.phase = null;
    this.line.visible = this.core.visible = this.flare.visible = this.streaks.visible = false;
  }

  /** A locked or firing line lies on the monster at `monster` (used to trigger Shield Bubble). */
  threatening(monster: THREE.Vector3): boolean {
    return (this.phase === 'lock' || this.phase === 'fire') && beamHits(bodyPoint(monster, _body), this.start, this.end, M.laserHitRadius * 1.3);
  }

  /**
   * One frame of `phase`, `t` s into the whole laser move, with the eye at `eye` and the body facing `heading`.
   */
  update(phase: MechLaserPhase, t: number, dt: number, eye: THREE.Vector3, heading: number, ctx: WorldContext): void {
    const entering = phase !== this.phase;
    this.phase = phase;
    this.start.copy(eye);
    const m = ctx.monster;
    bodyPoint(m.position, _body);
    if (phase === 'aim') {
      _to.subVectors(_body, eye);
      if (entering) {
        // It comes out of the charge along its facing, pitched at the monster.
        const across = Math.hypot(_to.x, _to.z);
        this.aim.set(Math.sin(heading) * across, _to.y, Math.cos(heading) * across).normalize();
      }
      rotateToward(this.aim, _to, M.laserTrackRate * dt, this.aim);
    }
    this.placeEnd();
    this.drawEye(phase, t, eye);
    this.drawLine(phase, t);
    this.updateStreaks(phase, entering, Math.min(1, t / M.laserCharge), dt, eye);
    if (entering) this.fxT = 0;
    this.fxT -= dt;
    if (phase === 'charge' && this.fxT <= 0) {
      this.fxT = M.laserSparkEvery;
      this.gather(eye, ctx);
    }
    if (phase !== 'fire') return;
    if (entering) {
      ctx.particles.emit('laserSpark', eye, 8, 1);
      ctx.shake(M.laserShake);
    }
    this.burn(dt, ctx);
    if (m.alive && beamHits(_body, this.start, this.end, M.laserHitRadius)) ctx.damageMonster(M.laserDps * dt, 'beam');
  }

  /** The line's far end: laserLength along the aim, cut short by the ground. */
  private placeEnd(): void {
    const toGround = this.aim.y < -1e-6 ? -this.start.y / this.aim.y : Infinity;
    this.end.copy(this.aim).multiplyScalar(Math.min(M.laserLength, toGround)).add(this.start);
  }

  /** Red sparks spawned around the eye, flying in to it. */
  private gather(eye: THREE.Vector3, ctx: WorldContext): void {
    const r = ctx.rng;
    const a = r() * Math.PI * 2;
    const y = r() * 2 - 1;
    const s = Math.sqrt(1 - y * y);
    _dir.set(Math.cos(a) * s, y, Math.sin(a) * s);
    _p.copy(eye).addScaledVector(_dir, M.laserSparkReach);
    ctx.particles.vent('laserSpark', _p, -_dir.x, -_dir.y, -_dir.z, M.laserSparkReach * 3, 2);
  }

  /** Buildings along the beam burn; where it ends it throws up fire and smoke, and the ground rumbles. */
  private burn(dt: number, ctx: WorldContext): void {
    for (let k = 1; k <= BEAM_SAMPLES; k++) {
      _p.lerpVectors(this.start, this.end, k / BEAM_SAMPLES);
      _spot.x = _p.x;
      _spot.z = _p.z;
      ctx.razeBuildings(_spot, M.laserHitRadius, M.laserBuildingDps * dt);
    }
    if (this.fxT > 0) return;
    this.fxT = M.laserBurnEvery;
    ctx.particles.emit('fire', this.end, 3, 0.5);
    ctx.particles.emit('laserSpark', this.end, 3, 1);
    ctx.particles.emit('smoke', this.end, 1, 0.5);
    ctx.shake(M.laserRumble);
  }

  /** The glow on the eye: swells through the charge, pulses harder locked, is largest firing, and fades in the recovery. */
  private drawEye(phase: MechLaserPhase, t: number, eye: THREE.Vector3): void {
    const fromFire = t - M.laserCharge - M.laserAim - M.laserLock;
    const k =
      phase === 'charge' ? 0.15 + 0.55 * (t / M.laserCharge)
      : phase === 'aim' ? 0.7
      : phase === 'lock' ? 0.8 + 0.12 * Math.sin(t * 40)
      : phase === 'fire' ? 1 + 0.08 * Math.sin(t * 60)
      : 0.8 * Math.max(0, 1 - (fromFire - M.laserFire) / M.laserRecover);
    this.flare.visible = true;
    this.flare.position.copy(eye);
    this.flare.scale.setScalar(M.laserEyeSize * k);
  }

  /** The thin aim line (wider once locked) during aim and lock; the shuddering beam with its hot core during fire. */
  private drawLine(phase: MechLaserPhase, t: number): void {
    const aiming = phase === 'aim' || phase === 'lock';
    const firing = phase === 'fire';
    this.line.visible = aiming || firing;
    this.core.visible = firing;
    if (aiming) this.placeLine(this.line, phase === 'lock' ? M.laserLockWidth : M.laserAimWidth);
    if (!firing) return;
    const w = M.laserWidth * (1 + 0.1 * Math.sin(t * 50));
    this.placeLine(this.line, w);
    this.placeLine(this.core, w * 0.45);
  }

  private placeLine(mesh: THREE.Mesh, width: number): void {
    _dir.subVectors(this.end, this.start);
    const len = _dir.length();
    _q.setFromUnitVectors(UP, _dir.normalize());
    mesh.position.copy(this.start);
    mesh.quaternion.copy(_q);
    mesh.scale.set(width, len, width);
  }

  /** Streak `i` starts over at a random direction and reach; `age` s of its life `life` have passed already. */
  private seedStreak(i: number, life: number, age: number): void {
    const a = Math.random() * Math.PI * 2;
    const y = Math.random() * 2 - 1;
    const s = Math.sqrt(1 - y * y);
    this.streakDirs[i * 3] = Math.cos(a) * s;
    this.streakDirs[i * 3 + 1] = y;
    this.streakDirs[i * 3 + 2] = Math.sin(a) * s;
    this.streakReach[i] = lerp(M.laserStreakReach[0], M.laserStreakReach[1], Math.random());
    this.streakLife[i] = life;
    this.streakAge[i] = age;
  }

  /**
   * The charge's streaks: each starts out at its reach and races in along its own line, accelerating, shrinking and
   * fading onto the eye. As the charge `k` (0..1) fills there are more of them and each lives less long.
   */
  private updateStreaks(phase: MechLaserPhase, entering: boolean, k: number, dt: number, eye: THREE.Vector3): void {
    const s = this.streaks;
    s.visible = phase === 'charge';
    if (!s.visible) return;
    const life = lerp(M.laserStreakLife[0], M.laserStreakLife[1], k);
    if (entering) for (let i = 0; i < M.laserStreaks[1]; i++) this.seedStreak(i, life, Math.random() * life);
    const n = Math.round(lerp(M.laserStreaks[0], M.laserStreaks[1], k));
    const pos = this.streakPos;
    const col = this.streakColor;
    for (let i = 0; i < n; i++) {
      this.streakAge[i] = this.streakAge[i]! + dt;
      if (this.streakAge[i]! >= this.streakLife[i]!) this.seedStreak(i, life, 0);
      const u = this.streakAge[i]! / this.streakLife[i]!;
      const reach = this.streakReach[i]!;
      const head = reach * (1 - u * u);
      const tail = head + reach * M.laserStreakLength * (1 - u);
      const dx = this.streakDirs[i * 3]!;
      const dy = this.streakDirs[i * 3 + 1]!;
      const dz = this.streakDirs[i * 3 + 2]!;
      pos.setXYZ(i * 2, dx * head, dy * head, dz * head);
      pos.setXYZ(i * 2 + 1, dx * tail, dy * tail, dz * tail);
      const alpha = Math.min(1, u * 8) * (1 - u * u);
      col.setW(i * 2, alpha);
      col.setW(i * 2 + 1, alpha * 0.35);
    }
    pos.needsUpdate = col.needsUpdate = true;
    s.geometry.setDrawRange(0, n * 2);
    s.position.copy(eye);
  }
}
