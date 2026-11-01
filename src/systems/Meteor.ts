import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Vec2 } from '../util/math';
import { meteorGeometry } from './meteorModel';
import { cutsceneK, cutsceneTotal, fallPosition } from './meteorMath';
import type { Particles } from './Particles';

export type MeteorEvent = 'landed' | 'collected';

type Phase = 'idle' | 'falling' | 'ground' | 'collected';

const _burst = new THREE.Vector3();

/**
 * The first break's alien diamond: a cutscene timeline (camera blend, slanted fall released during the blend, impact), then a
 * spinning, bobbing pickup on the ground under a rising column of glow and a faint light pillar. Standalone: the caller picks the spot, damages the city and grants the reward.
 */
export class Meteor {
  /** Where it falls to, then sits (y 0 on the ground; the gem hovers above it). */
  readonly position = new THREE.Vector3();
  private readonly mesh: THREE.Mesh;
  /** The scorched dish under the landing site: shown on landing, kept after pickup, hidden by clear(). */
  private readonly crater: THREE.Mesh;
  private readonly look = new THREE.Vector3();
  private readonly target: Vec2 = { x: 0, z: 0 };
  private phase: Phase = 'idle';
  private t = 0;
  private time = 0;
  /** The faint additive light pillar over the landed gem. */
  private readonly pillar: THREE.Mesh;
  private beacon = 0;
  private beaconSpark = 0;
  private started = false;

  constructor(scene: THREE.Scene, private particles: Particles) {
    // Unlit: the gem glows at full vertex colour whatever the light.
    this.mesh = new THREE.Mesh(meteorGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.mesh.name = 'meteor-gem';
    this.mesh.scale.setScalar(CONFIG.meteor.size);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // A flat dark disc a little above the ground, pulled forward by polygon offset so it never fights the roads.
    this.crater = new THREE.Mesh(
      new THREE.CircleGeometry(CONFIG.meteor.impactRadius, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: CONFIG.palette.meteorCrater, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    this.crater.name = 'meteor-crater';
    this.crater.position.y = 0.6;
    this.crater.renderOrder = 2;
    this.crater.visible = false;
    scene.add(this.crater);
    // An open cylinder, bright at its foot and fading to black at the top (additive, so black is invisible).
    const m = CONFIG.meteor;
    const tube = new THREE.CylinderGeometry(m.pillarRadius, m.pillarRadius * 1.6, m.pillarHeight, 12, 1, true).translate(0, m.pillarHeight / 2, 0);
    const glow = new THREE.Color(CONFIG.palette.meteor);
    const tint = new Float32Array(tube.getAttribute('position').count * 3);
    for (let i = 0; i < tint.length / 3; i++) {
      const f = 1 - tube.getAttribute('position').getY(i) / m.pillarHeight;
      tint.set([glow.r * f, glow.g * f, glow.b * f], i * 3);
    }
    tube.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    this.pillar = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: m.pillarOpacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.pillar.name = 'meteor-pillar';
    this.pillar.renderOrder = 3;
    this.pillar.frustumCulled = false;
    this.pillar.visible = false;
    scene.add(this.pillar);
  }

  get onGround(): boolean {
    return this.phase === 'ground';
  }

  get cutsceneActive(): boolean {
    return this.started && this.t < cutsceneTotal();
  }

  /** Begin the cutscene: the gem will fall to `landAt`. */
  start(landAt: Vec2): void {
    this.target.x = landAt.x;
    this.target.z = landAt.z;
    this.position.set(landAt.x, 0, landAt.z);
    this.phase = 'idle';
    this.started = true;
    this.t = 0;
    this.time = 0;
    this.beacon = 0;
    this.beaconSpark = 0;
    this.mesh.visible = false;
    this.crater.visible = false;
    this.pillar.visible = false;
  }

  update(dt: number, monster: Vec2, monsterRadius: number, airborne: boolean): MeteorEvent | null {
    if (!this.started && this.phase !== 'ground') return null;
    const m = CONFIG.meteor;
    this.time += dt;
    if (this.started) {
      this.t += dt;
      if (this.t >= cutsceneTotal()) this.started = false;
    }

    if (this.phase === 'idle' && this.t >= m.fallStart) this.phase = 'falling';

    if (this.phase === 'falling') {
      const ft = this.t - m.fallStart;
      if (ft >= m.fallTime) {
        this.phase = 'ground';
        this.beacon = 0;
        this.beaconSpark = 0;
        this.pillar.position.set(this.position.x, 0, this.position.z);
        this.pillar.visible = true;
        this.mesh.position.set(this.position.x, m.size * 0.45, this.position.z);
        this.look.copy(this.position);
        this.crater.position.set(this.position.x, 0.6, this.position.z);
        this.crater.visible = true;
        this.impact();
        return 'landed';
      }
      const p = fallPosition(this.target, ft);
      this.mesh.visible = true;
      this.mesh.position.copy(p);
      this.mesh.rotation.y += dt * 6;
      this.look.copy(p);
      this.particles.emit('plasma', p, 3, 1.5);
      this.particles.emit('spark', p, 2, 2);
      return null;
    }

    if (this.phase === 'ground') {
      this.mesh.rotation.y += dt * m.spin;
      this.mesh.position.y = m.size * 0.45 + Math.sin(this.time * 2) * m.bob;
      // The column leaves from the gem's top, so the gem itself stays in view.
      _burst.set(this.position.x, m.size * 1.0, this.position.z);
      this.beacon += dt * m.beaconRate;
      this.beaconSpark += dt * m.beaconSparkRate;
      const glow = Math.floor(this.beacon);
      const sparks = Math.floor(this.beaconSpark);
      this.beacon -= glow;
      this.beaconSpark -= sparks;
      if (glow > 0) this.particles.emit('beacon', _burst, glow, 1);
      if (sparks > 0) this.particles.emit('beaconSpark', _burst, sparks, 1);
      if (!airborne && Math.hypot(monster.x - this.position.x, monster.z - this.position.z) <= m.pickupRadius + monsterRadius) {
        this.phase = 'collected';
        this.mesh.visible = false;
        this.pillar.visible = false;
        _burst.set(this.position.x, m.size * 0.5, this.position.z);
        this.particles.explosion(_burst, 2);
        this.particles.emit('plasma', _burst, 24, 3);
        this.particles.emit('spark', _burst, 24, 3);
        return 'collected';
      }
    }
    return null;
  }

  /** Impact flash, dust and shard burst and shockwave ring (the caller adds shake and flattens buildings). */
  private impact(): void {
    const m = CONFIG.meteor;
    _burst.set(this.position.x, m.size * 0.3, this.position.z);
    this.particles.explosion(_burst, 4);
    this.particles.emit('dust', _burst, 30, 3);
    this.particles.emit('plasma', _burst, 20, 3);
    _burst.y = 0;
    this.particles.ring('dust', _burst, m.impactRadius, 36);
  }

  /** Camera blend toward the sky (0..1); 0 when no cutscene runs. */
  lookK(): number {
    return this.started ? cutsceneK(this.t) : 0;
  }

  /** What the cutscene camera looks at: the top of the fall, then the falling gem, then the impact point. */
  lookPoint(): THREE.Vector3 {
    if (this.phase === 'idle') return this.look.copy(fallPosition(this.target, 0));
    return this.look;
  }

  clear(): void {
    this.started = false;
    this.phase = 'idle';
    this.t = 0;
    this.mesh.visible = false;
    this.crater.visible = false;
    this.pillar.visible = false;
  }
}
