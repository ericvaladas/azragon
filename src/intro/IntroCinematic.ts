import * as THREE from 'three';
import { CONFIG } from '../config';
import { CRATER_RADIUS, type City } from '../world/City';
import type { Monster } from '../monster/Monster';
import type { Particles } from '../systems/Particles';
import type { Shockwave } from '../systems/Shockwave';
import { faceted, toonMat } from '../render/toon';
import { CloudLayer } from './CloudLayer';
import { PodModel } from './PodModel';
import { SpaceScene } from './SpaceScene';
import { heatColor } from './spaceMath';
import { CUT_TIME, EMERGE_TIME, IMPACT_TIME, INTRO_LENGTH, cameraPath, flashAt, monsterRiseY, podPath, shakeAt } from './timeline';

export type IntroHost = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Element the flash overlay is added to (the scene container). */
  overlay: HTMLElement;
  monster: Monster;
  city: City;
  particles: Particles;
  shockwave: Shockwave;
};

const I = CONFIG.intro;
const ORIGIN = new THREE.Vector3();
const FRAGMENTS = 5;
const FRAG_GRAVITY = 600;
type Fragment = { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 };
const _pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
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
  private pod = new PodModel(I.podLength);
  private clouds: CloudLayer;
  private fragments: Fragment[] = [];
  private fragGeo = faceted(new THREE.TetrahedronGeometry(I.podLength * 0.28, 0));
  private fragMat = toonMat(0x3b2433);
  private flashEl: HTMLDivElement;
  private trailT = 0;

  constructor(private host: IntroHost) {
    this.pod.root.visible = false;
    host.scene.add(this.pod.root);
    this.clouds = new CloudLayer(host.scene);
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'intro-flash';
    host.overlay.appendChild(this.flashEl);
  }

  /** The space scene is what's on screen (before the cut). */
  get inSpace(): boolean {
    return this.active && this.t < CUT_TIME;
  }

  start(): void {
    this.active = true;
    this.t = 0;
    this.trailT = 0;
    this.clearFragments();
    this.pod.root.visible = false;
    this.pod.setGlow(0);
    this.clouds.visible = false;
    const m = this.host.monster;
    m.position.set(0, monsterRiseY(0), 0);
    m.model.root.visible = false;
    this.flashEl.style.opacity = '0';
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
    if (t < INTRO_LENGTH) return false;
    this.finish();
    return true;
  }

  /** Jump to the end state: crater blasted, pod and fragments gone, monster standing at the origin. */
  skip(): void {
    if (!this.active) return;
    this.host.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true);
    this.host.particles.clear();
    this.finish();
  }

  private updateWorld(prev: number, t: number, dt: number): void {
    const h = this.host;
    if (prev < CUT_TIME) this.pod.root.visible = true;
    if (prev < IMPACT_TIME && t >= IMPACT_TIME) this.impact();
    if (prev < EMERGE_TIME && t >= EMERGE_TIME) this.burst();

    const pod = this.pod.root;
    if (t < IMPACT_TIME) {
      // Nose-down (+Z nose turned to -Y), leaning into the fall; white-hot cooling to orange; fire and smoke trail.
      podPath(t, pod.position);
      pod.rotation.set(Math.PI / 2 - 0.25, 0, t * 1.5);
      this.pod.setHeat(heatColor(Math.max(0.5, 1 - (t - CUT_TIME) / 3), _c));
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.03;
        h.particles.emit('fire', pod.position, 3, 0.6);
        h.particles.emit('smoke', _p.copy(pod.position).setY(pod.position.y + I.podLength * 0.4), 2, 0.5);
      }
    } else if (t < EMERGE_TIME) {
      // Half-buried and tipped over; cooling, while the seams pulse faster and brighter toward the split.
      podPath(t, pod.position);
      pod.rotation.set(Math.PI / 2 - 1.1, 0.3, 0);
      const k = (t - IMPACT_TIME) / (EMERGE_TIME - IMPACT_TIME);
      this.pod.setHeat(heatColor(0.5 * (1 - k), _c));
      this.pod.setGlow(k * (0.5 + 0.5 * Math.sin(t * (4 + k * 14))));
      if (Math.random() < dt * 8) h.particles.emit('smoke', _p.set(0, 20, 0), 2, 1.5);
    } else {
      h.monster.position.y = monsterRiseY(t);
      this.updateFragments(t, dt);
    }

    this.clouds.visible = t < IMPACT_TIME;
    if (this.clouds.visible) this.clouds.update(h.camera);
    this.updateFog(t);

    cameraPath(t, _pose);
    const s = shakeAt(t);
    const amp = s * s * I.shakeAmp;
    h.camera.position.copy(_pose.pos).add(_p.set(Math.sin(t * 43) * amp, Math.sin(t * 61 + 1) * amp, Math.sin(t * 53 + 2) * amp));
    h.camera.lookAt(_pose.look);
  }

  /** Dense fog inside the cloud band, easing back to the game's fog through the descent. */
  private updateFog(t: number): void {
    const fog = this.host.scene.fog as THREE.Fog;
    const D = I.starts.descent;
    const u = Math.min(1, Math.max(0, (t - D) / (IMPACT_TIME - D)));
    fog.near = I.cloudFog.near + (CONFIG.fog.near - I.cloudFog.near) * u;
    fog.far = I.cloudFog.far + (CONFIG.fog.far - I.cloudFog.far) * u;
  }

  private impact(): void {
    const h = this.host;
    h.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, false);
    h.shockwave.start(ORIGIN, CRATER_RADIUS * 2.5);
    h.particles.ring('dust', ORIGIN, CRATER_RADIUS * 1.2, 48);
    h.particles.explosion(_p.set(0, 40, 0), 4);
    h.particles.emit('debris', _p.set(0, 30, 0), 30, 3);
    h.particles.emit('smoke', _p.set(0, 60, 0), 24, 2.5);
  }

  /** The cocoon splits: shell fragments fly out in a green burst and the monster starts to climb out. */
  private burst(): void {
    const h = this.host;
    this.pod.root.visible = false;
    _p.set(0, I.podLength * 0.3, 0);
    for (let i = 0; i < FRAGMENTS; i++) {
      const a = (i / FRAGMENTS) * Math.PI * 2 + 0.4;
      const mesh = new THREE.Mesh(this.fragGeo, this.fragMat);
      mesh.position.copy(_p);
      mesh.castShadow = true;
      h.scene.add(mesh);
      this.fragments.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * 260, 380 + 120 * (i % 2), Math.sin(a) * 260),
        spin: new THREE.Vector3(3 + i, 2, 4 - i),
      });
    }
    h.particles.emit('acid', _p, 40, 2.5);
    h.particles.ring('dust', ORIGIN, CRATER_RADIUS * 0.6, 24);
    h.monster.model.root.visible = true;
    h.monster.position.y = monsterRiseY(EMERGE_TIME);
  }

  /** Fragments arc out, land, and shrink away over the last 0.6 s so nothing pops at play start. */
  private updateFragments(t: number, dt: number): void {
    const shrink = Math.min(1, Math.max(0, (INTRO_LENGTH - t) / 0.6));
    for (const f of this.fragments) {
      const m = f.mesh;
      if (m.position.y > 0 || f.vel.y > 0) {
        f.vel.y -= FRAG_GRAVITY * dt;
        m.position.addScaledVector(f.vel, dt);
        m.rotation.x += f.spin.x * dt;
        m.rotation.y += f.spin.y * dt;
        m.rotation.z += f.spin.z * dt;
        if (m.position.y <= 0) {
          m.position.y = 0;
          f.vel.set(0, 0, 0);
        }
      }
      m.scale.setScalar(shrink);
    }
  }

  private clearFragments(): void {
    for (const f of this.fragments) f.mesh.removeFromParent();
    this.fragments = [];
  }

  private finish(): void {
    this.active = false;
    this.t = INTRO_LENGTH;
    this.pod.root.visible = false;
    this.clouds.visible = false;
    this.clearFragments();
    this.flashEl.style.opacity = '0';
    const fog = this.host.scene.fog as THREE.Fog;
    fog.near = CONFIG.fog.near;
    fog.far = CONFIG.fog.far;
    const m = this.host.monster;
    m.position.set(0, 0, 0);
    m.model.root.visible = true;
  }

  dispose(): void {
    this.clearFragments();
    this.flashEl.remove();
    this.space.dispose();
    this.pod.dispose();
    this.clouds.dispose();
    this.fragGeo.dispose();
    this.fragMat.dispose();
  }
}
