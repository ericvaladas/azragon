import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted } from '../render/toon';
import { ballistic } from './projectileMath';

export type ShotKind = 'spike' | 'shell' | 'rocket' | 'glob';
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

/** Pooled projectiles drawn with one InstancedMesh per kind. */
export class Projectiles {
  onHit: (h: Hit) => void = () => {};
  onTrail: (p: THREE.Vector3) => void = () => {};
  private shots: Shot[] = [];
  private free: Shot[] = [];
  private meshes: Record<ShotKind, THREE.InstancedMesh>;
  private sizes: Record<ShotKind, [number, number, number]> = {
    spike: [12, 60, 12],
    shell: [8, 8, 8],
    rocket: [6, 22, 6],
    glob: [26, 26, 26],
  };

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const make = (name: string, geo: THREE.BufferGeometry, color: number, max: number) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), max);
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
    };
  }

  /** The monster's own shots take its colours (spikes / storm bolts, mortar globs). */
  setTheme(spike: number, glob: number): void {
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

  /** Launches up and outward (with yaw spread), then homes on the target's live position. */
  fireSpike(from: THREE.Vector3, target: Target, damage: number, yawOffset: number): void {
    const s = this.alloc('spike', from, target.position, damage, target);
    _d.subVectors(target.position, from).setY(0).normalize().applyAxisAngle(_yaxis, yawOffset);
    s.vel.set(_d.x, 0.8, _d.z).normalize().multiplyScalar(CONFIG.monster.spikeSpeed);
    s.dur = SPIKE_TTL;
  }

  fireShell(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('shell', from, to, damage, null);
    s.dur = CONFIG.tank.shellFlightTime;
  }

  /** Acid Mortar glob: a high ballistic lob that splashes where it lands. */
  fireGlob(from: THREE.Vector3, to: THREE.Vector3, damage: number): void {
    const s = this.alloc('glob', from, to, damage, null);
    s.dur = CONFIG.passives.mortar.flightTime;
  }

  /** Enemy shells and rockets in flight. */
  incoming(): readonly InFlight[] {
    return this.shots.filter((s) => s.kind === 'shell' || s.kind === 'rocket');
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

  update(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]!;
      s.t += dt;
      let done = false;
      if (s.kind === 'spike') {
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
        else s.pos.lerpVectors(s.from, s.aim, k);
        s.vel.subVectors(s.aim, s.from);
        done = k >= 1;
      }
      s.trailT += dt;
      if (s.kind !== 'shell' && s.kind !== 'glob' && s.trailT >= TRAIL_EVERY) {
        s.trailT = 0;
        this.onTrail(s.pos);
      }
      if (done) {
        this.onHit({ kind: s.kind, point: s.pos.clone(), target: s.target, damage: s.damage });
        this.shots.splice(i, 1);
        this.free.push(s);
      }
    }
    this.draw();
  }

  private draw(): void {
    const counts: Record<ShotKind, number> = { spike: 0, shell: 0, rocket: 0, glob: 0 };
    for (const s of this.shots) {
      const mesh = this.meshes[s.kind];
      const i = counts[s.kind]++;
      if (i >= mesh.instanceMatrix.count) continue;
      _q.setFromUnitVectors(_fwd, _d.copy(s.vel).normalize());
      const [x, y, z] = this.sizes[s.kind];
      _m.compose(s.pos, _q, _s.set(x, y, z));
      mesh.setMatrixAt(i, _m);
    }
    for (const k of Object.keys(this.meshes) as ShotKind[]) {
      const mesh = this.meshes[k];
      mesh.count = Math.min(counts[k], mesh.instanceMatrix.count);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
