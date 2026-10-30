import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { Target } from '../../combat';
import type { Vec2 } from '../../util/math';
import { Lightning } from '../../systems/Lightning';
import type { Particles } from '../../systems/Particles';
import { ShadowHands } from './ShadowHands';
import { DEVOUR_HAND_T } from './handMath';
import { devourPhase, devourVictims } from './devour';

const U = CONFIG.wendigo.ultimate;
const T = U.t;
const C = CONFIG.wendigo.colors;

/** What Devour does to the game, supplied by GameScene. */
export type DevourHost = {
  /** Live enemy targets. */
  enemies(): readonly Target[];
  /** Take `t` into the ground: it dies without the usual explosion, giving its EXP. */
  take(t: Target): void;
  hurtBoss(t: Target, dmg: number): void;
  /** Standing buildings within `r` of `c`. */
  buildingsWithin(c: Vec2, r: number): Target[];
  /** Blood sky blend 0..1 (0 restores the city's own). */
  sky(k: number): void;
  /** Camera pull-back 0..1 (0 restores the player's own view). */
  camera(k: number): void;
  shake(amount: number): void;
  /** A lightning flash on the scene light, 0..1. */
  flash(k: number): void;
  /** The particle system (the hands boil smoke). */
  particles: Particles;
  /** Particles: shadow taking a victim (`take`) or a lightning strike's dust and embers (`bolt`). */
  burst(at: THREE.Vector3, kind: 'take' | 'bolt'): void;
};

type Pending = { t: number; target: Target };

/**
 * When the hands start to rise (as the circle finishes opening); each starts up to handStagger s later than that, so
 * they come in at their own times, and closes on its victim after its reach at handSpeed.
 */
const HANDS_AT = T.grasp - DEVOUR_HAND_T.impact * U.handSlow;

const _v = new THREE.Vector3();
/** Seconds the black circle takes to fade once the last hand is under (or, with no hands, from the outro). */
const CIRCLE_FADE = 1;

/** Flat ragged disc (radius ~1): a near-black body fading to a deep-red glow toward the rim. */
function circleGeometry(): THREE.BufferGeometry {
  const n = 40;
  const pos: number[] = [];
  const col: number[] = [];
  const inner = new THREE.Color(C.circle);
  const rim = new THREE.Color(C.circleGlow);
  const at = (a: number, r: number) => [Math.cos(a) * r, 0, Math.sin(a) * r];
  const ragged = (i: number) => 0.92 + 0.08 * Math.sin(i * 2.3) * Math.sin(i * 0.7 + 1);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const o0 = ragged(i);
    const o1 = ragged((i + 1) % n);
    pos.push(0, 0, 0, ...at(a1, o1 * 0.8), ...at(a0, o0 * 0.8));
    col.push(...inner.toArray(), ...inner.toArray(), ...inner.toArray());
    pos.push(...at(a0, o0 * 0.8), ...at(a1, o1 * 0.8), ...at(a1, o1));
    pos.push(...at(a0, o0 * 0.8), ...at(a1, o1), ...at(a0, o0));
    col.push(...inner.toArray(), ...inner.toArray(), ...rim.toArray(), ...inner.toArray(), ...rim.toArray(), ...rim.toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * Devour, the Wendigo's ultimate, on its real-time timeline (devourPhase): the world slows, the camera pulls back,
 * the sky bleeds red and lightning strikes around; a black circle opens; slow shadow hands rise for every enemy in
 * it, close on them at the grasp beat (each is taken; a boss is hurt instead) and drag their husks under; the buildings
 * in the circle collapse as it opens, nearest first; then everything drains away, the circle last, once every hand
 * is under.
 */
export class Devour {
  active = false;
  private t = 0;
  /** After the sequence ends, the camera still eases home on the same clock. */
  private returning = false;
  private center = new THREE.Vector3();
  private damageMult = 1;
  private time = 1;
  private nextBolt = 0;
  /** The lightning's own clock: it keeps striking while the timeline is held for the hands. */
  private boltT = 0;
  private spawned = false;
  private grasped = false;
  private collapsing = false;
  private figured: Target[] = [];
  private falling: Pending[] = [];
  private circle: THREE.Mesh;
  /** The circle's strength 0..1: opening with the phase, held while any hand is still dragging, then fading. */
  private circleK = 0;
  private lightning: Lightning;
  private hands: ShadowHands;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    private host: DevourHost,
    private rand: () => number = Math.random,
  ) {
    this.circle = new THREE.Mesh(
      circleGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
    );
    this.circle.renderOrder = 3;
    this.circle.visible = false;
    scene.add(this.circle);
    // Dust, embers and a jolt land with each return stroke, not as its leader sets off.
    this.lightning = new Lightning(scene, camera, { core: C.boltCore, edge: C.boltEdge, scorch: C.circle }, rand, (at) => {
      this.host.burst(at, 'bolt');
      this.host.shake(0.12);
    });
    // Each victim is taken the moment its own hand closes on it.
    this.hands = new ShadowHands(scene, {
      max: U.maxFigures,
      husks: true,
      size: U.handSize,
      timing: DEVOUR_HAND_T,
      under: U.handUnder,
      // Every hand rises and drags at the same speed (handSpeed m/s real; the hands' clock runs handSlow × slower).
      speed: U.handSpeed * U.handSlow,
      // Each victim is taken as its own hand closes.
      onImpact: (t) => {
        if (this.active && t.isAlive()) this.host.take(t);
      },
    });
  }

  /** World time scale while it runs (1 when idle). */
  timeScale(): number {
    return this.active ? this.time : 1;
  }

  start(center: THREE.Vector3, damageMult: number): void {
    this.clear();
    this.returning = false;
    this.active = true;
    this.center.set(center.x, 0, center.z);
    this.damageMult = damageMult;
    this.circle.position.set(center.x, 3, center.z);
    this.circle.scale.setScalar(U.radius);
    this.nextBolt = T.boltsFrom;
    this.host.shake(0.5);
  }

  /** Advance by real seconds (0 while paused). Returns true on the frame it ends. */
  update(realDt: number): boolean {
    if (this.returning) {
      // Control is back; the camera eases home and the last hands finish dragging their husks under and dissolve.
      this.t += realDt;
      const k = devourPhase(this.t).camera;
      this.host.camera(k);
      this.hands.update(realDt / U.handSlow, this.host.particles);
      this.drawCircle(realDt);
      if (k <= 0 && this.hands.count === 0 && this.circleK <= 0) this.returning = false;
      return false;
    }
    if (!this.active) return false;
    this.t += realDt;
    // Held at the outro while any hand is still out: the sky, slow motion, camera, circle and lightning wait for the
    // last victim to be dragged under.
    const holding = this.spawned && this.t >= T.outroFrom && this.hands.dragging();
    if (holding) this.t = T.outroFrom;
    this.boltT += realDt;
    const ph = devourPhase(this.t);
    this.time = ph.time;
    this.host.sky(ph.sky);
    this.host.camera(ph.camera);
    while ((ph.bolts || holding) && this.boltT >= this.nextBolt) {
      const a = this.rand() * Math.PI * 2;
      const r = Math.sqrt(this.rand()) * U.boltSpread * U.radius;
      _v.set(this.center.x + Math.cos(a) * r, 0, this.center.z + Math.sin(a) * r);
      this.lightning.strike(_v);
      this.nextBolt += U.boltEvery[0] + this.rand() * (U.boltEvery[1] - U.boltEvery[0]);
    }
    this.host.flash(this.lightning.update(realDt));
    const c = { x: this.center.x, z: this.center.z };
    if (!this.spawned && this.t >= HANDS_AT) {
      // A shadow hand rises for each victim (the nearest maxFigures), slowly, out of a pool beyond it.
      this.spawned = true;
      this.figured = devourVictims(c, U.radius, this.host.enemies(), U.maxFigures).held;
      // Delays are on the hands' slowed clock.
      for (const t of this.figured) this.hands.grab(t, this.center, (this.rand() * U.handStagger) / U.handSlow);
    }
    if (!this.grasped && this.t >= T.grasp) {
      this.grasped = true;
      // The hands take their own victims as each closes; everyone else inside now (past the hand cap, or come in
      // since the hands rose) is taken in a burst of shadow.
      const now = devourVictims(c, U.radius, this.host.enemies(), U.maxFigures);
      const handed = new Set(this.figured);
      for (const t of [...now.held, ...now.extra]) {
        if (handed.has(t)) continue;
        this.host.burst(t.position, 'take');
        this.host.take(t);
      }
      for (const b of now.bosses) this.host.hurtBoss(b, U.bossDamage * this.damageMult);
      this.host.shake(0.6);
    }
    if (this.spawned) this.hands.update(realDt / U.handSlow, this.host.particles);
    this.drawCircle(realDt);
    // The buildings come down as the circle opens, nearest first, spreading out with it.
    if (!this.collapsing && this.t >= T.circleFrom) {
      this.collapsing = true;
      const span = T.circleTo - T.circleFrom;
      for (const b of this.host.buildingsWithin(c, U.radius)) {
        const d = Math.hypot(b.position.x - c.x, b.position.z - c.z);
        this.falling.push({ t: T.circleFrom + span * Math.min(1, d / U.radius), target: b });
      }
      this.falling.sort((a, b) => a.t - b.t);
    }
    while (this.falling.length > 0 && this.t >= this.falling[0]!.t) {
      const b = this.falling.shift()!.target;
      if (b.isAlive()) b.applyDamage(1e9);
    }
    if (!ph.done) return false;
    // Control comes back now; the camera carries on home, and the hands finish, over the next updates.
    const t = this.t;
    this.host.sky(0);
    this.host.flash(0);
    this.clear(true);
    this.t = t;
    this.returning = true;
    return true;
  }

  /**
   * The black circle opens with the phase; from the outro it holds while any hand is still dragging its victim
   * under, then fades over CIRCLE_FADE s (carrying on after control comes back).
   */
  private drawCircle(realDt: number): void {
    if (this.active && this.t < T.outroFrom) this.circleK = devourPhase(this.t).circle;
    else if (!this.hands.dragging()) this.circleK = Math.max(0, this.circleK - realDt / CIRCLE_FADE);
    this.circle.visible = this.circleK > 0;
    (this.circle.material as THREE.MeshBasicMaterial).opacity = 0.92 * this.circleK;
    this.circle.rotation.y += realDt * 0.15;
  }

  /** Stop at once, restoring the sky, camera and time (restart, exit, death). */
  cancel(): void {
    if (!this.active && !this.returning) return;
    this.returning = false;
    this.host.sky(0);
    this.host.camera(0);
    this.host.flash(0);
    this.clear();
  }

  /** Reset to idle; `keepHands` leaves the hands to finish their drag (the natural end). */
  private clear(keepHands = false): void {
    this.active = false;
    this.t = 0;
    this.time = 1;
    this.spawned = this.grasped = this.collapsing = false;
    this.boltT = 0;
    this.figured = [];
    this.falling = [];
    if (!keepHands) {
      this.circle.visible = false;
      this.circleK = 0;
    }
    this.lightning.clear();
    if (!keepHands) this.hands.clear();
  }

  dispose(): void {
    this.circle.removeFromParent();
    this.circle.geometry.dispose();
    (this.circle.material as THREE.Material).dispose();
    this.lightning.dispose();
    this.hands.dispose();
  }
}
