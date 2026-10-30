import * as THREE from 'three';
import { CONFIG } from '../config';
import { patchShieldDome, shieldBuildProgress, shieldDome } from './shieldDome';

const HIT_LIFE = 0.45;
const MAX_HITS = 24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const FACING = new THREE.Vector3(0, 0, 1);

/**
 * Auto-shield visuals. Shield Bubble is a cyan dome that builds itself from the ground up — triangles snapping into
 * place one by one, each glowing as it lands — holds while the ability runs, then swells slightly and dims away where
 * it hung. Reflect Shield stays invisible: each reflected projectile flashes a violet hexagon patch on the shield
 * surface where it struck.
 */
export class ShieldFx {
  private bubble: THREE.Mesh;
  private fill: THREE.InstancedMesh;
  private rim: THREE.InstancedMesh;
  private hits: { at: THREE.Vector3; normal: THREE.Vector3; age: number }[] = [];
  private time = 0;
  /** How far the dome has built (0 = nothing laid, 1 = complete), shared by its fill and its lattice. */
  private build = { value: 1 };
  /** How lit the whole dome is (1 = up, 0 = gone), shared the same way. */
  private fade = { value: 0 };
  /** Seconds the dome has been building, or -1 while it is not. */
  private buildT = -1;
  /** Seconds the dome has been fading out, or -1 while it is up or gone. */
  private fadeT = -1;
  /** Whether the dome is on screen at all: building, up, or fading out. */
  private showing = false;
  /** Where the dome hangs: the monster's centre while the bubble is up, held where it let go after. */
  private at = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const B = CONFIG.passives.bubble;
    const dome = shieldDome(new THREE.IcosahedronGeometry(1, 1));
    const additive = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // The dome: a translucent skin under its triangle lattice. Every edge lies in two bricks, so the lattice draws
    // twice: half the opacity, the same brightness.
    const skin = additive(CONFIG.palette.bubbleFill, 0.22);
    const lattice = new THREE.LineBasicMaterial({ color: CONFIG.palette.bubbleRim, transparent: true, opacity: 0.4, fog: false });
    this.bubble = new THREE.Mesh(dome.fill, skin);
    this.bubble.add(new THREE.LineSegments(dome.wire, lattice));
    for (const m of [skin, lattice]) patchShieldDome(m, { build: this.build, fade: this.fade, window: B.brickWindow, flash: B.flash });
    this.bubble.visible = false;
    this.bubble.renderOrder = 5;
    this.bubble.frustumCulled = false;
    this.fill = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 6), additive(CONFIG.palette.reflectFill, 1), MAX_HITS);
    this.rim = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 6), additive(CONFIG.palette.reflectRim, 1), MAX_HITS);
    for (const m of [this.fill, this.rim]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 6;
      for (let i = 0; i < MAX_HITS; i++) m.setColorAt(i, _c.setRGB(1, 1, 1));
    }
    scene.add(this.bubble, this.fill, this.rim);
  }

  /** The bubble is going up: build the dome from nothing (also catches a bubble that finds an old dome still fading). */
  startBubble(): void {
    this.showing = true;
    this.buildT = 0;
    this.build.value = 0;
    this.fadeT = -1;
    this.fade.value = 1;
  }

  /** Flash a reflect patch at `at` (on the shield surface), facing outward along `normal`. */
  reflectHit(at: THREE.Vector3, normal: THREE.Vector3): void {
    if (this.hits.length >= MAX_HITS) this.hits.shift();
    this.hits.push({ at: at.clone(), normal: normal.clone().normalize(), age: 0 });
  }

  update(dt: number, center: THREE.Vector3, bubble: boolean): void {
    this.time += dt;
    const s = CONFIG.monster.scale;
    const B = CONFIG.passives.bubble;

    if (bubble) this.at.copy(center); // the dome rides with the monster, then holds still while it fades
    if (bubble && (this.fadeT >= 0 || !this.showing)) this.startBubble();
    if (!bubble && this.showing && this.fadeT < 0) {
      // The bubble is done. A build still running closes first, then the whole dome dims out.
      this.fadeT = 0;
      this.buildT = -1;
      this.build.value = 1;
    }
    // The build and the fade run on the game clock.
    if (this.buildT >= 0) {
      this.buildT += dt;
      this.build.value = shieldBuildProgress(this.buildT, B.build);
      if (this.build.value >= 1) this.buildT = -1;
    }
    let out = 0; // how far the fade-out has got, 0 → 1
    if (this.fadeT >= 0) {
      this.fadeT += dt;
      out = Math.min(1, this.fadeT / B.fade);
      this.fade.value = (1 - out) * (1 - out);
      if (out >= 1) {
        this.fadeT = -1;
        this.showing = false;
        this.fade.value = 0;
      }
    }
    this.bubble.visible = this.showing;
    if (this.showing) {
      this.bubble.position.set(this.at.x, this.at.y + 300 * s, this.at.z);
      // Going out, it lets go: out to fadeSwell of its radius as it dims.
      this.bubble.scale.setScalar(520 * s * (1 + (this.fadeT >= 0 ? B.fadeSwell * out : 0)));
      this.bubble.rotation.y = this.time * 0.4;
    }
    for (const h of this.hits) h.age += dt;
    this.hits = this.hits.filter((h) => h.age < HIT_LIFE);
    this.hits.forEach((h, i) => {
      const k = h.age / HIT_LIFE;
      _q.setFromUnitVectors(FACING, _n.copy(h.normal));
      _m.compose(_p.copy(h.at), _q, _s.setScalar(70 + 90 * k));
      this.fill.setMatrixAt(i, _m);
      this.rim.setMatrixAt(i, _m);
      // Additive blending: dimming the colour fades the patch out.
      const dim = (1 - k) * (1 - k);
      this.fill.setColorAt(i, _c.setRGB(dim, dim, dim));
      this.rim.setColorAt(i, _c.setRGB(1 - k, 1 - k, 1 - k));
    });
    for (const m of [this.fill, this.rim]) {
      m.count = this.hits.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  clear(): void {
    this.bubble.visible = false;
    this.buildT = this.fadeT = -1;
    this.build.value = 1;
    this.fade.value = 0;
    this.showing = false;
    this.hits = [];
    this.fill.count = this.rim.count = 0;
  }
}
