import * as THREE from 'three';
import { CONFIG } from '../config';
import { CRATER_RADIUS, type City } from '../world/City';
import type { Monster } from '../monster/Monster';
import type { Particles } from '../systems/Particles';
import { Shockwave } from '../systems/Shockwave';
import { faceted, toonMat } from '../render/toon';
import { PodModel } from './PodModel';
import { SpaceScene } from './SpaceScene';
import { heatColor } from './spaceMath';
import { CUT_TIME, EMERGE_TIME, FALL_PITCH, IMPACT_TIME, INTRO_LENGTH, blackAt, cameraPath, flashAt, silhouetteAt, introFog, monsterCrouch, podLengthFor, podPath, podSpin, shakeAt } from './timeline';

export type IntroHost = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Element the flash overlay is added to (the scene container). */
  overlay: HTMLElement;
  monster: Monster;
  city: City;
  particles: Particles;
};

const I = CONFIG.intro;
const ORIGIN = new THREE.Vector3();
const X = I.impact;
const FRAGMENTS = 7;
const GRAVITY = 600;
/** Heat the shell cools to during the fall (and from which it cools out in the crater). */
const FALL_EMBER = 0.12;
/** A tumbling solid thrown by the impact (boulders) or the split (shell fragments); `size` is its full scale. */
type Fragment = { mesh: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; size: number };
const _pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3() };
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * The opening cinematic: the space scene until the cut, then the pod's fall, impact, and the
 * monster's emergence in the game world. Drives the game camera itself while active.
 */
export class IntroCinematic {
  readonly space = new SpaceScene();
  active = false;
  t = 0;
  private pod = new PodModel(1);
  /** Cocoon length for the selected monster; set in start(). */
  private podLength = 1;
  private fragments: Fragment[] = [];
  private fragGeo = faceted(new THREE.TetrahedronGeometry(0.17, 0));
  private fragMat = toonMat(0x3b2433);
  /** Boulders: simulated as plain transforms, drawn as one instanced mesh (one draw call). */
  private boulders: Fragment[] = [];
  private boulderMesh = new THREE.InstancedMesh(faceted(new THREE.DodecahedronGeometry(1, 0)), toonMat(CONFIG.palette.debris), X.boulders);
  /** Impact rings: white-hot, fire, then a slow wide dust front. */
  private rings: Shockwave[];
  private flashEl: HTMLDivElement;
  private blackEl: HTMLDivElement;
  private trailT = 0;

  constructor(private host: IntroHost) {
    this.pod.root.visible = false;
    host.scene.add(this.pod.root);
    this.boulderMesh.count = 0;
    this.boulderMesh.castShadow = true;
    this.boulderMesh.frustumCulled = false;
    host.scene.add(this.boulderMesh);
    const colors = [0xfff1d6, CONFIG.palette.fire, CONFIG.palette.dust];
    this.rings = X.rings.map((r, i) => new Shockwave(host.scene, colors[i]!, r.life));
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'intro-flash';
    this.blackEl = document.createElement('div');
    this.blackEl.className = 'intro-black';
    host.overlay.append(this.flashEl, this.blackEl);
  }

  /** The space scene is what's on screen (before the cut). */
  get inSpace(): boolean {
    return this.active && this.t < CUT_TIME;
  }

  start(): void {
    this.podLength = podLengthFor(this.host.monster.kind.stats.size);
    this.pod.setLength(this.podLength);
    this.active = true;
    this.t = 0;
    this.trailT = 0;
    this.clearFragments();
    for (const r of this.rings) r.clear();
    this.pod.root.visible = false;
    this.pod.setGlow(0);
    const m = this.host.monster;
    // Standing on the crater floor, curled up inside the (as yet unseen) cocoon.
    m.position.set(0, 0, 0);
    m.pose.dip = I.crouchDip;
    m.visible = false;
    this.flashEl.style.opacity = '0';
    this.blackEl.style.opacity = '1';
    this.space.update(0, 0);
  }

  /** Advance by real seconds. Returns true on the frame the intro finishes. */
  update(dt: number): boolean {
    if (!this.active) return false;
    const prev = this.t;
    const t = (this.t += dt);
    if (t < CUT_TIME) this.space.update(t, dt);
    else this.updateWorld(prev, t, dt);
    this.flashEl.style.opacity = flashAt(t).toFixed(3);
    this.blackEl.style.opacity = blackAt(t).toFixed(3);
    if (t < INTRO_LENGTH) return false;
    this.finish();
    return true;
  }

  /** Jump to the end state: crater blasted, pod and fragments gone, monster standing at the origin. */
  skip(): void {
    if (!this.active) return;
    this.host.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * X.outer);
    this.host.particles.clear();
    for (const r of this.rings) r.clear();
    this.finish();
  }

  private updateWorld(prev: number, t: number, dt: number): void {
    const h = this.host;
    if (prev < CUT_TIME) this.pod.root.visible = true;
    if (prev < IMPACT_TIME && t >= IMPACT_TIME) this.impact();
    X.rings.forEach((r, i) => {
      const at = IMPACT_TIME + r.delay;
      if (prev < at && t >= at) this.rings[i]!.start(ORIGIN, CRATER_RADIUS * r.radius);
    });
    for (const r of this.rings) r.update(dt);
    if (prev < EMERGE_TIME && t >= EMERGE_TIME) this.burst();

    const pod = this.pod.root;
    // Nose-first along the fall, rolling until impact; it stays buried exactly as it hit until it splits.
    podPath(t, pod.position);
    pod.rotation.set(FALL_PITCH, 0, podSpin(t));
    if (t < IMPACT_TIME) {
      // White-hot, cooling quickly to a dull ember glow so the shell's detail shows; fire and smoke trail.
      this.pod.setHeat(heatColor(Math.max(FALL_EMBER, 1 - (t - CUT_TIME) / 1.5), _c));
      this.trailT -= dt;
      if (this.trailT <= 0) {
        // Fire wraps the whole (large) shell; smoke streams from its trailing top.
        this.trailT = 0.02;
        const L = this.podLength;
        for (let i = 0; i < 3; i++) h.particles.emit('fire', this.around(pod.position, L * 0.3, L * 0.1), 2, 0.8);
        h.particles.emit('smoke', this.around(pod.position, L * 0.25, L * 0.5), 3, 0.6);
      }
    } else if (t < EMERGE_TIME) {
      // Cooling, while the shell throbs faster and stronger toward the split.
      const k = (t - IMPACT_TIME) / (EMERGE_TIME - IMPACT_TIME);
      this.pod.setHeat(heatColor(FALL_EMBER * (1 - k), _c));
      this.pod.setGlow(k * (0.5 + 0.5 * Math.sin(t * (4 + k * 14))));
      // The crater keeps burning and smoking around the cocoon.
      if (Math.random() < dt * 8) h.particles.emit('smoke', _p.set(0, 20, 0), 2, 1.5);
      if (Math.random() < dt * X.fireRate * (1 - k * 0.5)) {
        this.around(ORIGIN, CRATER_RADIUS * 0.9, 10);
        h.particles.emit('fire', _p, 3, 0.5);
        h.particles.emit('smoke', _p, 2, 0.6);
      }
      this.updateFragments(t, dt);
    } else {
      h.monster.pose.dip = I.crouchDip * monsterCrouch(t);
      h.monster.setSilhouette(silhouetteAt(t));
      this.updateFragments(t, dt);
    }

    cameraPath(t, this.podLength, _pose);
    const s = shakeAt(t);
    const amp = s * s * I.shakeAmp;
    h.camera.position.copy(_pose.pos).add(_p.set(Math.sin(t * 43) * amp, Math.sin(t * 61 + 1) * amp, Math.sin(t * 53 + 2) * amp));
    h.camera.up.copy(_pose.up);
    h.camera.lookAt(_pose.look);
    introFog(h.camera.position.y, h.scene.fog as THREE.Fog);
  }

  /** A random point within `r` of `c` horizontally, `up` above it (written to the shared scratch vector). */
  private around(c: THREE.Vector3, r: number, up: number): THREE.Vector3 {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r;
    return _p.set(c.x + Math.cos(a) * d, c.y + up, c.z + Math.sin(a) * d);
  }

  /**
   * The crash: the crater and a wave of toppling buildings racing outward behind the shock rings, a core
   * fireball ringed by secondary blasts, a rising smoke column, dust walls, and boulders hurled across the city.
   */
  private impact(): void {
    const h = this.host;
    const R = CRATER_RADIUS;
    h.city.blast({ x: 0, z: 0 }, R, false, R * X.outer, X.shockSpeed);
    h.particles.explosion(_p.set(0, 60, 0), 7);
    for (let i = 0; i < X.fireballs; i++) {
      const a = (i / X.fireballs) * Math.PI * 2;
      h.particles.explosion(_p.set(Math.cos(a) * R * 0.55, 30, Math.sin(a) * R * 0.55), 2.5);
    }
    for (let i = 0; i < 16; i++) h.particles.emit('smoke', this.around(ORIGIN, R * 0.25, i * 35), 3, 1.2);
    h.particles.ring('dust', ORIGIN, R * 0.8, 70);
    h.particles.ring('dust', ORIGIN, R * 1.8, 90);
    // Impact dust clouds: a wall of huge billows rolling out from the crater, and a column boiling up from it.
    h.particles.ring('billow', ORIGIN, R * X.dustRing, X.dustBillows);
    h.particles.emit('billow', _p.set(0, 60, 0), X.dustColumn, 0.35);
    h.particles.emit('debris', _p.set(0, 60, 0), 80, 5);
    for (let i = 0; i < X.boulders; i++) {
      const a = Math.random() * Math.PI * 2;
      const out = 350 + Math.random() * 500;
      const rock = this.launch(new THREE.Object3D(), _p.set(Math.cos(a) * R * 0.3, 40, Math.sin(a) * R * 0.3), 12 + Math.random() * 24, a, out, 450 + Math.random() * 450);
      this.boulders.push(rock);
    }
  }

  /** Set an object flying from `from`: `out` m/s horizontally along `angle`, `up` m/s upward, tumbling. */
  private launch(obj: THREE.Object3D, from: THREE.Vector3, size: number, angle: number, out: number, up: number): Fragment {
    obj.position.copy(from);
    obj.scale.setScalar(size);
    const spin = new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
    return { mesh: obj, vel: new THREE.Vector3(Math.cos(angle) * out, up, Math.sin(angle) * out), spin, size };
  }

  /** The cocoon splits: shell fragments fly out in a green burst and the monster starts to climb out. */
  private burst(): void {
    const h = this.host;
    this.pod.root.visible = false;
    _p.set(0, this.podLength * 0.3, 0);
    for (let i = 0; i < FRAGMENTS; i++) {
      const a = (i / FRAGMENTS) * Math.PI * 2 + 0.4;
      const mesh = new THREE.Mesh(this.fragGeo, this.fragMat);
      mesh.castShadow = true;
      h.scene.add(mesh);
      this.fragments.push(this.launch(mesh, _p.set(0, this.podLength * 0.3, 0), this.podLength, a, 520, 480 + 160 * (i % 2)));
    }
    h.particles.emit('acid', _p.set(0, this.podLength * 0.3, 0), 60, 3);
    h.particles.ring('dust', ORIGIN, CRATER_RADIUS * 0.6, 24);
    // The monster stands up in a cloud of smoke as a black silhouette, coming into colour as the smoke thins.
    const L = this.podLength;
    // A ring of it around (not over) the monster, low, so the dark shape shows through the gaps before it thins away.
    for (let i = 0; i < I.reveal.veil; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = L * (0.35 + Math.random() * 0.35);
      h.particles.emit('veil', _p.set(Math.cos(a) * d, Math.random() * L * 0.3, Math.sin(a) * d), 1);
    }
    h.monster.setSilhouette(1);
    h.monster.visible = true;
  }

  /** Boulders and shell fragments arc out, land, and shrink away over the last 0.6 s so nothing pops at play start. */
  private updateFragments(t: number, dt: number): void {
    const shrink = Math.min(1, Math.max(0, (INTRO_LENGTH - t) / 0.6));
    for (const f of this.fragments) this.fly(f, shrink, dt);
    this.boulders.forEach((f, i) => {
      this.fly(f, shrink, dt);
      f.mesh.updateMatrix();
      this.boulderMesh.setMatrixAt(i, f.mesh.matrix);
    });
    this.boulderMesh.count = this.boulders.length;
    this.boulderMesh.instanceMatrix.needsUpdate = true;
  }

  private fly(f: Fragment, shrink: number, dt: number): void {
    const m = f.mesh;
    if (m.position.y > 0 || f.vel.y > 0) {
      f.vel.y -= GRAVITY * dt;
      m.position.addScaledVector(f.vel, dt);
      m.rotation.x += f.spin.x * dt;
      m.rotation.y += f.spin.y * dt;
      m.rotation.z += f.spin.z * dt;
      if (m.position.y <= 0) {
        m.position.y = 0;
        f.vel.set(0, 0, 0);
      }
    }
    m.scale.setScalar(f.size * shrink);
  }

  private clearFragments(): void {
    for (const f of this.fragments) f.mesh.removeFromParent();
    this.fragments = [];
    this.boulders = [];
    this.boulderMesh.count = 0;
  }

  private finish(): void {
    this.active = false;
    this.t = INTRO_LENGTH;
    this.pod.root.visible = false;
    this.clearFragments();
    this.flashEl.style.opacity = '0';
    this.blackEl.style.opacity = '0';
    this.host.camera.up.set(0, 1, 0);
    const fog = this.host.scene.fog as THREE.Fog;
    fog.near = CONFIG.fog.near;
    fog.far = CONFIG.fog.far;
    const m = this.host.monster;
    m.position.set(0, 0, 0);
    m.pose.dip = 0;
    m.setSilhouette(0);
    m.visible = true;
  }

  dispose(): void {
    this.clearFragments();
    this.flashEl.remove();
    this.blackEl.remove();
    this.space.dispose();
    this.pod.dispose();
    this.fragGeo.dispose();
    this.fragMat.dispose();
    this.boulderMesh.geometry.dispose();
    (this.boulderMesh.material as THREE.Material).dispose();
  }
}
