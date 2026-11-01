import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { faceted, painted } from '../render/toon';
import { ballistic } from './projectileMath';

/**
 * `wisp`: a Hungry Ghost (homes like a spike). `shard`: a cosmetic Bone Ward shard. `gustav`: the Schwerer Gustav's huge
 * shell. `cannon`: the boss mech's black shell, a rocket's flight with no trail.
 */
export type ShotKind = 'spike' | 'shell' | 'rocket' | 'glob' | 'chunk' | 'wisp' | 'shard' | 'gustav' | 'cannon';
/** An enemy shell or rocket in flight, as seen by Spine Shield. */
export type InFlight = { readonly kind: ShotKind; readonly pos: THREE.Vector3 };
export type Hit = { kind: ShotKind; point: THREE.Vector3; target: Target | null; damage: number };

type Shot = {
  kind: ShotKind;
  from: THREE.Vector3;
  aim: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: Target | null;
  t: number;
  dur: number;
  damage: number;
  trailT: number;
};

const SPIKE_TTL = 3;
const SPIKE_TURN = 4; // homing responsiveness
const TRAIL_EVERY = 0.06;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 1, 0);
const _yaxis = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _puff = new THREE.Vector3();
/** Bone Ward shards (m/s); their flight is capped so they never lag the intercept they show. */
const SHARD_SPEED = 2400;

/**
 * The Gustav's shell along +Y in a unit box: a steel body, a copper driving band near its base and a brass nose cone
 * (the shot is drawn pointing along its flight).
 */
function gustavShellGeometry(): THREE.BufferGeometry {
  const P = CONFIG.palette;
  const g = mergeGeometries([
    painted(faceted(new THREE.CylinderGeometry(0.5, 0.5, 0.65, 8).translate(0, -0.175, 0)), P.gustavShell),
    painted(faceted(new THREE.CylinderGeometry(0.53, 0.53, 0.07, 8).translate(0, -0.38, 0)), P.gustavShellBand),
    painted(faceted(new THREE.ConeGeometry(0.5, 0.35, 8).translate(0, 0.325, 0)), P.gustavShellNose),
  ]);
  if (!g) throw new Error('Projectiles: Gustav shell merge failed');
  return g;
}

/** The mech's cannon shell along +Y in a unit box: a black body and a gunmetal nose (drawn pointing along its flight). */
function cannonShellGeometry(): THREE.BufferGeometry {
  const P = CONFIG.palette;
  const g = mergeGeometries([
    painted(faceted(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 6).translate(0, -0.15, 0)), P.cannonShell),
    painted(faceted(new THREE.ConeGeometry(0.5, 0.3, 6).translate(0, 0.35, 0)), P.cannonShellNose),
  ]);
  if (!g) throw new Error('Projectiles: cannon shell merge failed');
  return g;
}

/** Pooled projectiles drawn with one InstancedMesh per kind. */
export class Projectiles {
  onHit: (h: Hit) => void = () => {};
  /**
   * Called every TRAIL_EVERY s for each shot in flight except tank shells, cannon shells, globs, hurled chunks and shards; for a Gustav shell, every
   * CONFIG.gustav.trailSpacing m, with `hold` the seconds until it lands (so its whole trail can fade together).
   */
  onTrail: (p: THREE.Vector3, kind: ShotKind, hold?: number) => void = () => {};
  private shots: Shot[] = [];
  /** Whether the monster's spikes trail smoke (its theme; see setTheme). */
  private spikeTrail = true;
  private free: Shot[] = [];
  private meshes: Record<ShotKind, THREE.InstancedMesh>;
  private sizes: Record<ShotKind, [number, number, number]> = {
    spike: [12, 60, 12],
    shell: [8, 8, 8],
    rocket: [6, 22, 6],
    glob: [26, 26, 26],
    chunk: [60, 60, 60],
    wisp: [30, 42, 30],
    shard: [18, 64, 18],
    gustav: [CONFIG.gustav.shellDiameter, CONFIG.gustav.shellLength, CONFIG.gustav.shellDiameter],
    cannon: [10, 36, 10],
  };

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const make = (name: string, geo: THREE.BufferGeometry, color: number, max: number) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, vertexColors: geo.hasAttribute('color') }), max);
      m.name = name;
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.meshes = {
      spike: make('shot-spike', faceted(new THREE.ConeGeometry(0.5, 1, 4)), P.stinger, 64),
      shell: make('shot-shell', new THREE.BoxGeometry(1, 1, 1), P.eye, 128),
      rocket: make('shot-rocket', faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 5)), 0xf2f2f2, 64),
      glob: make('shot-glob', faceted(new THREE.IcosahedronGeometry(0.5, 0)), CONFIG.palette.acid, 48),
      chunk: make('shot-chunk', faceted(new THREE.DodecahedronGeometry(0.5, 0)), CONFIG.kraken.colors.chunk, 32),
      wisp: make('shot-wisp', faceted(new THREE.IcosahedronGeometry(0.5, 0)), CONFIG.wendigo.colors.ghost, 64),
      shard: make('shot-shard', faceted(new THREE.ConeGeometry(0.5, 1, 4)), CONFIG.wendigo.colors.boneShard, 48),
      gustav: make('shot-gustav', gustavShellGeometry(), 0xffffff, 16),
      cannon: make('shot-cannon', cannonShellGeometry(), 0xffffff, 32),
    };
  }

  /** The monster's own shots take its colours (spikes / storm bolts, mortar globs); `spikeTrail` false fires bare spikes. */
  setTheme(spike: number, glob: number, spikeTrail = true): void {
    this.spikeTrail = spikeTrail;
    (this.meshes.spike.material as THREE.MeshBasicMaterial).color.setHex(spike);
    (this.meshes.glob.material as THREE.MeshBasicMaterial).color.setHex(glob);
  }

  clear(): void {
    this.free.push(...this.shots);
    this.shots = [];
  }

  private alloc(kind: ShotKind, from: THREE.Vector3, aim: THREE.Vector3, damage: number, target: Target | null): Shot {
    const s = this.free.pop() ?? {
      kind, from: new THREE.Vector3(), aim: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      target: null, t: 0, dur: 1, damage: 0, trailT: 0,
    };
    s.kind = kind;
    s.from.copy(from);
    s.aim.copy(aim);
    s.pos.copy(from);
    s.target = target;
    s.t = 0;
    s.damage = damage;
    s.trailT = 0;
    this.shots.push(s);
    return s;
  }

  /**
   * Launches up and outward (with yaw spread), then homes on the target's live position; `straight` (the Insect's tail)
   * launches it straight at the target instead, so it flies a line.
   */
  fireSpike(from: THREE.Vector3, target: Target, damage: number, yawOffset: number, straight = false): void {
    const s = this.alloc('spike', from, target.position, damage, target);
    if (straight) _d.subVectors(target.position, from).normalize().applyAxisAngle(_yaxis, yawOffset);
    else _d.subVectors(target.position, from).setY(0).normalize().applyAxisAngle(_yaxis, yawOffset).setY(0.8);
    s.vel.copy(_d).normalize().multiplyScalar(CONFIG.monster.spikeSpeed);
    s.dur = SPIKE_TTL;
  }

  /** A tank shell: flies at CONFIG.tank.shellSpeed on its arc, so nearer targets are hit sooner. */
  fireShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('shell', from, to, damage, null);
    s.dur = Math.max(0.1, from.distanceTo(to) / CONFIG.tank.shellSpeed);
  }

  /** The Schwerer Gustav's shell: a straight, fast flight at CONFIG.gustav.shellSpeed; it trails smoke. */
  fireGustavShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('gustav', from, to, damage, null);
    s.dur = Math.max(0.05, from.distanceTo(to) / CONFIG.gustav.shellSpeed);
  }

  /** Acid Mortar glob: a high ballistic lob that splashes where it lands. */
  fireGlob(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('glob', from, to, damage, null);
    s.dur = CONFIG.passives.mortar.flightTime;
  }

  /** Kraken Hurl: a chunk of rubble lobbed on a high arc; it splashes where it lands. */
  fireChunk(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('chunk', from, to, damage, null);
    s.dur = CONFIG.kraken.arms.hurl.flight;
  }

  /** Hungry Ghost: a soft wisp that launches like a spike and homes on the target's live position. */
  fireWisp(from: THREE.Vector3, target: Target, damage: number, yawOffset: number): void {
    this.fireSpike(from, target, damage, yawOffset);
    this.shots[this.shots.length - 1]!.kind = 'wisp';
  }

  /** Bone Ward: a cosmetic shard flying straight to `to` (no damage); it reports a hit when it arrives. */
  fireShard(from: THREE.Vector3, to: THREE.Vector3): void {
    const s = this.alloc('shard', from, to, 0, null);
    s.dur = Math.min(0.25, Math.max(0.08, from.distanceTo(to) / SHARD_SPEED));
  }

  /** Enemy shells (tank, Gustav and the mech's cannon) and rockets in flight. */
  incoming(): readonly InFlight[] {
    return this.shots.filter((s) => s.kind === 'shell' || s.kind === 'rocket' || s.kind === 'gustav' || s.kind === 'cannon');
  }

  /** Destroy an in-flight shot without it hitting anything. Returns false if it was already gone. */
  intercept(shot: InFlight): boolean {
    const i = this.shots.indexOf(shot as Shot);
    if (i < 0) return false;
    this.free.push(this.shots[i]!);
    this.shots.splice(i, 1);
    return true;
  }

  fireRocket(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('rocket', from, to, damage, null);
    s.dur = Math.max(0.2, from.distanceTo(to) / CONFIG.jet.rocketSpeed);
  }

  /** The mech's cannon shell: a rocket's straight flight, black, with no trail. */
  fireCannon(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('cannon', from, to, damage, null);
    s.dur = Math.max(0.2, from.distanceTo(to) / CONFIG.jet.rocketSpeed);
  }

  update(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      s.t += dt;
      _prev.copy(s.pos);
      let done = false;
      if (s.kind === 'spike' || s.kind === 'wisp') {
        if (s.target?.isAlive()) s.aim.copy(s.target.position);
        _d.subVectors(s.aim, s.pos);
        const dist = _d.length();
        const want = _d.normalize().multiplyScalar(CONFIG.monster.spikeSpeed);
        s.vel.lerp(want, 1 - Math.exp(-SPIKE_TURN * dt));
        s.pos.addScaledVector(s.vel, dt);
        const hitR = Math.max(30, s.target?.radius ?? 30);
        done = dist < hitR || s.t >= s.dur;
        if (done && !(s.target?.isAlive() ?? false)) s.target = null;
      } else {
        const k = Math.min(1, s.t / s.dur);
        if (s.kind === 'shell') ballistic(s.from, s.aim, CONFIG.tank.shellArc, k, s.pos);
        else if (s.kind === 'glob') ballistic(s.from, s.aim, CONFIG.passives.mortar.arc, k, s.pos);
        else if (s.kind === 'chunk') ballistic(s.from, s.aim, CONFIG.kraken.arms.hurl.arc, k, s.pos);
        else s.pos.lerpVectors(s.from, s.aim, k);
        s.vel.subVectors(s.aim, s.from);
        done = k >= 1;
      }
      if (s.kind === 'gustav') this.chemtrail(s);
      else s.trailT += dt;
      const trails = s.kind !== 'shell' && s.kind !== 'glob' && s.kind !== 'chunk' && s.kind !== 'shard' && s.kind !== 'gustav' && s.kind !== 'cannon' && (s.kind !== 'spike' || this.spikeTrail);
      if (trails && s.trailT >= TRAIL_EVERY) {
        s.trailT = 0;
        this.onTrail(s.pos, s.kind);
      }
      if (done) {
        this.onHit({ kind: s.kind, point: s.pos.clone(), target: s.target, damage: s.damage });
        this.shots.splice(i, 1);
        this.free.push(s);
      }
    }
    this.draw();
  }

  /** Gustav shells: a puff every CONFIG.gustav.trailSpacing m along this step (`trailT` holds metres since the last). */
  private chemtrail(s: Shot): void {
    const step = s.pos.distanceTo(_prev);
    if (step <= 0) return;
    const gap = CONFIG.gustav.trailSpacing;
    let along = gap - s.trailT;
    const hold = Math.max(0, s.dur - s.t);
    for (; along <= step; along += gap) this.onTrail(_puff.lerpVectors(_prev, s.pos, along / step), s.kind, hold);
    s.trailT = step - (along - gap);
  }

  private draw(): void {
    const counts: Record<ShotKind, number> = { spike: 0, shell: 0, rocket: 0, glob: 0, chunk: 0, wisp: 0, shard: 0, gustav: 0, cannon: 0 };
    for (const s of this.shots) {
      const mesh = this.meshes[s.kind];
      const i = counts[s.kind]++;
      if (i >= mesh.instanceMatrix.count) continue;
      _q.setFromUnitVectors(_fwd, _d.copy(s.vel).normalize());
      const [x, y, z] = this.sizes[s.kind];
      let at = s.pos;
      if (s.kind === 'wisp') {
        // Drawn only: ghosts drift and bob about their path, and pulse as they fly.
        at = _p.set(Math.sin(s.t * 7 + i * 1.7) * 14, Math.sin(s.t * 9 + i) * 10, Math.cos(s.t * 6 + i * 2.3) * 14).add(s.pos);
        const pulse = 1 + 0.18 * Math.sin(s.t * 13 + i);
        _s.set(x * pulse, y * pulse, z * pulse);
      } else _s.set(x, y, z);
      _m.compose(at, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    for (const k of Object.keys(this.meshes) as ShotKind[]) {
      const mesh = this.meshes[k];
      mesh.count = Math.min(counts[k], mesh.instanceMatrix.count);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
