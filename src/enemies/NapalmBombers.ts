import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { toonMat } from '../render/toon';
import type { EnemySystem, WorldContext } from './types';
import { escaped, fleePoint } from './retreat';
import { bombPosition, bombReleases, bomberDone, bomberPosition, impactPoints, newRun, patchAlpha, patchDps, warningAlpha, type BombRelease, type NapalmRun, type Patch } from './napalmMath';
import { PROPS, bomberGeometry, bombGeometry, propDiscGeometry, propGeometry, splashGeometry } from './napalmModel';

const N = CONFIG.napalm;
const P = CONFIG.palette;
/** Patches alive at once (two full bomb lines, plus room for a third bomber's line overlapping their fade). */
const MAX_PATCHES = 24;
/** Peak opacity of the warning strip, and its width (m) across the bomb line. */
const WARN_OPACITY = 0.45;
const WARN_WIDTH = N.patchRadius * 1.3;
/** Particles a fully burning patch emits per second. */
const FLAMES_PER_S = 22;
/** Seconds between smoke puffs behind a falling bomb. */
const BOMB_TRAIL_EVERY = 0.05;
const _look = new THREE.Vector3();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
/** Flat ground layers sit over roads and the crater decal (which are themselves polygon-offset). */
const LIFT = { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } as const;
const FIRE = new THREE.Color(P.napalmFire);
const HOT = new THREE.Color(0xffd54a);

class Bomber implements Target {
  readonly kind = 'napalm' as const;
  readonly airborne = true;
  readonly radius = N.hitRadius;
  readonly group = new THREE.Group();
  readonly position = this.group.position;
  readonly props: THREE.Group[] = [];
  readonly releases: BombRelease[];
  readonly dir: THREE.Vector3;
  hp: number;
  crashing = false;
  /** Run clock (s since spawn) and the index of the next bomb to release. */
  t = 0;
  next = 0;
  flashT = 0;
  /** Crash fall: vertical speed, roll, roll rate and the trail clock. */
  vy = 0;
  bank = 0;
  spin = 0;
  /** Taken quietly: it vanishes below the ground instead of crashing. */
  silent = false;
  trailT = 0;
  propSpeed: number = N.propSpin;
  /** Heading out of the map; the bombing run was dropped when the retreat began. */
  fleeing = false;

  constructor(
    readonly run: NapalmRun,
    readonly material: THREE.MeshToonMaterial,
    readonly strip: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>,
    hp: number,
    private onDamage: (b: Bomber, amount: number) => void,
  ) {
    this.hp = hp;
    this.releases = bombReleases(run);
    this.dir = new THREE.Vector3(run.hx, 0, run.hz);
  }

  isAlive(): boolean {
    return !this.crashing;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** A bomb in flight: its run and release, seconds since release, its planned impact point and its mesh. */
type Bomb = { run: NapalmRun; rel: BombRelease; tau: number; at: { x: number; z: number }; mesh: THREE.Mesh; trailT: number };
/** A warning strip that outlives its bomber once bombs are falling: the run clock drives its fade. */
type Strip = { run: NapalmRun; t: number; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> };
/** A burning patch plus its fixed yaw (so the ragged outlines don't all line up) and flicker phase. */
type Fire = Patch & { yaw: number; phase: number };

/**
 * Napalm bombers: a propeller bomber flies one straight run over where the monster stood when it spawned,
 * lays a line of bombs centred there, and flies on out of the city. While the army retreats it drops nothing and flies out. Each bomb leaves a patch of burning
 * napalm that hurts the monster while it stands in it.
 */
export class NapalmBombers implements EnemySystem {
  readonly kind = 'napalm' as const;
  private ctx: WorldContext | null = null;
  private bombers: Bomber[] = [];
  private bombs: Bomb[] = [];
  private strips: Strip[] = [];
  private fires: Fire[] = [];
  private dropped = 0;
  /** Clock for the patches' flicker. */
  private flickerT = 0;
  /** Burn clock: a tick lands each time it reaches burnTick; it starts full so stepping into fire burns at once. */
  private burnT: number = N.burnTick;
  private body = bomberGeometry();
  private propGeo = propGeometry();
  private discGeo = propDiscGeometry();
  private bombGeo = bombGeometry();
  private stripGeo = new THREE.PlaneGeometry(WARN_WIDTH, (N.bombs - 1) * N.spacing + N.patchRadius * 2).rotateX(-Math.PI / 2);
  private propMat = toonMat(P.napalmDark);
  private discMat = new THREE.MeshBasicMaterial({ color: P.napalmDark, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
  private bombMat = toonMat(P.napalmBomb);
  /** Ground fire, three instanced layers: a dark scorch, the orange blaze over it and its hot yellow heart. */
  private scorch: THREE.InstancedMesh;
  private blaze: THREE.InstancedMesh;
  private core: THREE.InstancedMesh;

  constructor(private scene: THREE.Scene) {
    const splash = splashGeometry();
    this.scorch = this.layer(splash, new THREE.MeshBasicMaterial({ color: P.napalmScorch, transparent: true, opacity: 0.55, ...LIFT }), 2, false);
    this.blaze = this.layer(splash, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, ...LIFT }), 3, true);
    this.core = this.layer(splash, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, ...LIFT }), 4, true);
  }

  /** `tinted` layers carry a per-instance colour (additive layers fade by dimming it). */
  private layer(geo: THREE.BufferGeometry, mat: THREE.MeshBasicMaterial, order: number, tinted: boolean): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, MAX_PATCHES);
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = order;
    if (tinted) m.setColorAt(0, _c.setHex(0x000000));
    this.scene.add(m);
    return m;
  }

  targets(): readonly Target[] {
    return this.bombers;
  }

  count(): number {
    return this.bombers.filter((b) => !b.crashing).length;
  }

  /** Bombs released since the last clear. */
  bombsDropped(): number {
    return this.dropped;
  }

  /** Live burning patches. */
  patches(): readonly Patch[] {
    return this.fires;
  }

  /** The flight runs of the bombers still in the sky, in spawn order. */
  runs(): NapalmRun[] {
    return this.bombers.map((b) => b.run);
  }

  clear(): void {
    for (const b of this.bombers) {
      this.scene.remove(b.group);
      this.dropStrip(b.strip);
    }
    for (const b of this.bombs) this.scene.remove(b.mesh);
    for (const s of this.strips) this.dropStrip(s.mesh);
    this.bombers = [];
    this.bombs = [];
    this.strips = [];
    this.fires = [];
    this.dropped = 0;
    this.burnT = N.burnTick;
    this.drawFires(0);
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.count() >= CONFIG.spawns.napalm.cap) return;
    const m = ctx.monster.position;
    const d = ctx.spawnDir();
    // Napalm bearings put x on cos, z on sin.
    const run = newRun({ x: m.x, z: m.z }, Math.atan2(d.z, d.x));
    const mat = toonMat(0xffffff, { vertexColors: true });
    const strip = new THREE.Mesh(this.stripGeo, new THREE.MeshBasicMaterial({ color: P.napalmScorch, transparent: true, opacity: 0, ...LIFT }));
    strip.position.set(run.aim.x, 2.5, run.aim.z);
    strip.rotation.y = Math.atan2(run.hx, run.hz);
    strip.renderOrder = 2;
    strip.visible = false;
    const b = new Bomber(run, mat, strip, N.hp * ctx.difficulty.hpMult, this.damage);
    const body = new THREE.Mesh(this.body, mat);
    body.castShadow = true;
    b.group.add(body);
    for (const hub of PROPS) {
      const prop = new THREE.Group();
      prop.position.copy(hub);
      prop.add(new THREE.Mesh(this.propGeo, this.propMat), new THREE.Mesh(this.discGeo, this.discMat));
      b.props.push(prop);
      b.group.add(prop);
    }
    const p = bomberPosition(run, 0);
    b.position.set(p.x, p.y, p.z);
    b.group.lookAt(_look.copy(b.position).add(b.dir));
    this.scene.add(b.group, strip);
    this.bombers.push(b);
  }

  private damage = (b: Bomber, amount: number): void => {
    if (b.crashing) return;
    b.hp -= amount;
    b.flashT = 0.1;
    if (b.hp > 0) return;
    b.crashing = true;
    b.spin = (Math.random() < 0.5 ? -1 : 1) * 2.5;
    if (this.ctx?.quiet) {
      b.silent = true;
      b.position.y = -1;
    } else {
      this.ctx?.particles.explosion(b.position, 1.2);
      this.ctx?.particles.emit('smoke', b.position, 6, 0.8);
    }
    // Bombs already falling still land, and their strip fades out on schedule; shot down before the first
    // release, nothing drops and the strip goes with it.
    if (!b.fleeing && b.next > 0) this.strips.push({ run: b.run, t: b.t, mesh: b.strip });
    else this.dropStrip(b.strip);
    this.ctx?.onDestroyed(b, N.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    for (let i = this.bombers.length - 1; i >= 0; i--) {
      const b = this.bombers[i]!;
      b.flashT = Math.max(0, b.flashT - dt);
      b.material.emissive.setHex(b.flashT > 0 ? 0xffffff : 0x000000);
      if (b.crashing) {
        if (this.crash(b, dt, ctx)) {
          this.scene.remove(b.group);
          this.bombers.splice(i, 1);
          continue;
        }
      } else if (ctx.retreating === true) {
        if (escaped(b.position, ctx.monster.position)) {
          this.scene.remove(b.group);
          this.dropStrip(b.strip);
          this.bombers.splice(i, 1);
          continue;
        }
        this.flyOff(b, dt, ctx);
      } else {
        b.t += dt;
        const p = bomberPosition(b.run, b.t);
        b.position.set(p.x, p.y, p.z);
        for (; b.next < b.releases.length && b.t >= b.releases[b.next]!.t; b.next++) this.release(b, b.releases[b.next]!, ctx);
        this.drawStrip(b.strip, warningAlpha(b.run, b.t));
        if (bomberDone(b.run, b.t)) {
          this.scene.remove(b.group);
          this.dropStrip(b.strip);
          this.bombers.splice(i, 1);
          continue;
        }
      }
      b.group.lookAt(_look.copy(b.position).add(b.dir));
      b.group.rotateZ(b.bank);
      for (const prop of b.props) prop.rotation.z += b.propSpeed * dt;
    }
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const s = this.strips[i]!;
      s.t += dt;
      const a = warningAlpha(s.run, s.t);
      this.drawStrip(s.mesh, a);
      if (a <= 0) {
        this.dropStrip(s.mesh);
        this.strips.splice(i, 1);
      }
    }
    this.updateBombs(dt, ctx);
    this.updateFires(dt, ctx);
  }

  /** Drops the bombing run (its warning strip goes; bombs already falling still land) and flies straight away from the monster at cruise speed. */
  private flyOff(b: Bomber, dt: number, ctx: WorldContext): void {
    if (!b.fleeing) {
      b.fleeing = true;
      this.dropStrip(b.strip);
    }
    const away = fleePoint(b.position, ctx.monster.position, CONFIG.cycle.exitDistance + 200);
    b.dir.set(away.x - b.position.x, 0, away.z - b.position.z).normalize();
    b.position.addScaledVector(b.dir, N.speed * dt);
    b.bank += (0 - b.bank) * (1 - Math.exp(-3 * dt));
  }

  /** Copies the jets' crash: falls, rolls, trails smoke and blows up on the ground. True once it has hit. */
  private crash(b: Bomber, dt: number, ctx: WorldContext): boolean {
    b.vy -= 120 * dt;
    b.position.addScaledVector(b.dir, N.speed * 0.8 * dt);
    b.position.y += b.vy * dt;
    b.bank += b.spin * dt;
    b.propSpeed = Math.max(2, b.propSpeed - 10 * dt);
    b.trailT += dt;
    if (b.trailT > 0.05) {
      b.trailT = 0;
      ctx.particles.emit('smoke', b.position, 1, 0.3);
      ctx.particles.emit('fire', b.position, 1, 0.2);
    }
    if (b.position.y > 0) return false;
    if (b.silent) return true;
    const p = b.position.clone().setY(0);
    ctx.particles.explosion(p, 2);
    ctx.particles.ring('dust', p, 120, 12);
    ctx.splash(p, 2);
    ctx.shake(0.3);
    return true;
  }

  private release(b: Bomber, rel: BombRelease, ctx: WorldContext): void {
    const k = b.next;
    const at = impactPoints(b.run)[k]!;
    const mesh = new THREE.Mesh(this.bombGeo, this.bombMat);
    this.scene.add(mesh);
    const bomb: Bomb = { run: b.run, rel, tau: b.t - rel.t, at, mesh, trailT: 0 };
    this.placeBomb(bomb);
    this.bombs.push(bomb);
    this.dropped++;
    ctx.particles.emit('smoke', mesh.position, 1, 0.15);
  }

  private placeBomb(bomb: Bomb): void {
    const p = bombPosition(bomb.run, bomb.rel, bomb.tau);
    bomb.mesh.position.set(p.x, p.y, p.z);
    // Nose along the velocity: forward at the bomber's speed, falling ever faster.
    _v.set(bomb.run.hx * N.speed, -N.bombGravity * bomb.tau, bomb.run.hz * N.speed);
    bomb.mesh.lookAt(_look.copy(bomb.mesh.position).add(_v));
  }

  private updateBombs(dt: number, ctx: WorldContext): void {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i]!;
      bomb.tau += dt;
      if (bomb.tau < bomb.rel.fall) {
        this.placeBomb(bomb);
        bomb.trailT += dt;
        if (bomb.trailT >= BOMB_TRAIL_EVERY) {
          bomb.trailT = 0;
          ctx.particles.emit('smoke', bomb.mesh.position, 1, 0.08);
        }
        continue;
      }
      this.scene.remove(bomb.mesh);
      this.bombs.splice(i, 1);
      this.impact(bomb.at, ctx);
    }
  }

  private impact(at: { x: number; z: number }, ctx: WorldContext): void {
    _v.set(at.x, 8, at.z);
    ctx.particles.explosion(_v, 1.1);
    ctx.particles.emit('napalm', _v, 10, 1.4);
    ctx.particles.ring('fire', _v.setY(0), N.patchRadius * 1.4, 10);
    ctx.particles.emit('smoke', _v.setY(20), 4, 1);
    ctx.splash(_v.setY(0), 1.2);
    ctx.shake(0.12);
    if (this.fires.length >= MAX_PATCHES) this.fires.shift();
    this.fires.push({ x: at.x, z: at.z, age: 0, yaw: Math.random() * Math.PI * 2, phase: Math.random() * 10 });
  }

  /** Ages the patches, burns the monster standing in one, and feeds their flames, smoke and embers. */
  private updateFires(dt: number, ctx: WorldContext): void {
    for (const f of this.fires) f.age += dt;
    this.fires = this.fires.filter((f) => f.age < N.patchLife);
    const m = ctx.monster.position;
    const dps = ctx.monster.alive ? patchDps(this.fires, { x: m.x, z: m.z }) : 0;
    if (dps > 0) {
      this.burnT += dt;
      for (; this.burnT >= N.burnTick; this.burnT -= N.burnTick) ctx.damageMonster(dps * N.burnTick, 'napalm');
    } else this.burnT = N.burnTick;
    for (const f of this.fires) {
      const a = patchAlpha(f.age);
      // Fewer flames as a patch dies down; Poisson-ish rounding keeps low rates smooth.
      for (let n = Math.floor(dt * FLAMES_PER_S * a + Math.random()); n > 0; n--) {
        const r = Math.sqrt(Math.random()) * N.patchRadius * 0.85;
        const ang = Math.random() * Math.PI * 2;
        _v.set(f.x + Math.cos(ang) * r, 4, f.z + Math.sin(ang) * r);
        const roll = Math.random();
        // Mostly flame tongues, some embers and low fire, and a rising column of smoke over the top.
        if (roll < 0.62) ctx.particles.emit('napalm', _v, 1, 0.25);
        else if (roll < 0.78) ctx.particles.emit('ember', _v.setY(40), 1, 0.5);
        else if (roll < 0.86) ctx.particles.emit('fire', _v, 1, 0.25);
        else ctx.particles.emit('smoke', _v.setY(70), 1, 0.4);
      }
    }
    this.flickerT += dt;
    this.drawFires(this.flickerT);
  }

  private drawFires(time: number): void {
    this.fires.forEach((f, i) => {
      const a = patchAlpha(f.age);
      const flick = 0.85 + 0.15 * Math.sin(time * 19 + f.phase) * Math.sin(time * 7.3 + f.phase * 2);
      _q.setFromAxisAngle(UP, f.yaw);
      // Scorch: full size, and it stays a moment longer than the flames (shrinks only at the very end).
      const sr = N.patchRadius * 1.12 * Math.min(1, 0.4 + f.age / 0.25) * Math.min(1, 0.3 + (N.patchLife - f.age) / N.patchFade);
      _m.compose(_v.set(f.x, 2 + i * 0.01, f.z), _q, _s.set(sr, 1, sr));
      this.scorch.setMatrixAt(i, _m);
      // Blaze: additive, so dimming its colour fades it out.
      const br = N.patchRadius * (0.75 + 0.2 * a) * flick;
      _m.compose(_v.set(f.x, 2.6 + i * 0.01, f.z), _q, _s.set(br, 1, br));
      this.blaze.setMatrixAt(i, _m);
      this.blaze.setColorAt(i, _c.copy(FIRE).multiplyScalar(0.8 * a * flick));
      const cr = N.patchRadius * 0.42 * (0.9 + 0.2 * Math.sin(time * 13 + f.phase));
      _q.setFromAxisAngle(UP, -f.yaw * 1.7);
      _m.compose(_v.set(f.x, 3 + i * 0.01, f.z), _q, _s.set(cr, 1, cr));
      this.core.setMatrixAt(i, _m);
      this.core.setColorAt(i, _c.copy(HOT).multiplyScalar(0.7 * a * a * flick));
    });
    for (const layer of [this.scorch, this.blaze, this.core]) {
      layer.count = this.fires.length;
      layer.visible = this.fires.length > 0;
      layer.instanceMatrix.needsUpdate = true;
      if (layer.instanceColor) layer.instanceColor.needsUpdate = true;
    }
  }

  /** Takes a warning strip out of the scene and frees its own material (its geometry is shared). */
  private dropStrip(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>): void {
    if (!mesh.parent) return;
    this.scene.remove(mesh);
    mesh.material.dispose();
  }

  private drawStrip(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, alpha: number): void {
    mesh.visible = alpha > 0;
    mesh.material.opacity = WARN_OPACITY * alpha;
  }
}
