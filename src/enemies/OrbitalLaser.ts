import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { LASER_IDLE, laserHits, startLaser, stepLaser, type LaserState } from './laserPhases';
import type { EnemySystem, WorldContext } from './types';

const L = CONFIG.laser;
const MAX_SCORCH = 6;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A strike from orbit: faint tracking beam, brief lock, then a burning column. Dodged, never destroyed. */
export class OrbitalLaser implements EnemySystem {
  readonly kind = 'laser' as const;
  private state: LaserState = { ...LASER_IDLE };
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private core: THREE.Mesh;
  private glow: THREE.Mesh;
  private glowMat: THREE.MeshBasicMaterial;
  private scorch: THREE.InstancedMesh;
  private scorchMat: THREE.MeshBasicMaterial;
  private scorches: { x: number; z: number; age: number }[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    const P = CONFIG.palette;
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color: P.laserFaint, transparent: true, opacity: 0.3, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(cyl, this.beamMat);
    this.core = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: P.laserCore, fog: false }));
    this.glowMat = new THREE.MeshBasicMaterial({ color: P.laserFaint, transparent: true, opacity: 0.4, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), this.glowMat);
    this.scorchMat = new THREE.MeshBasicMaterial({ color: P.scorch, transparent: true, opacity: 0.75, depthWrite: false });
    this.scorch = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), this.scorchMat, MAX_SCORCH);
    this.scorch.count = 0;
    this.scorch.frustumCulled = false;
    for (const o of [this.beam, this.core, this.glow]) {
      o.visible = false;
      o.frustumCulled = false;
      o.renderOrder = 3;
    }
    scene.add(this.beam, this.core, this.glow, this.scorch);
  }

  targets(): readonly Target[] {
    return [];
  }

  count(): number {
    return this.state.phase === 'idle' ? 0 : 1;
  }

  clear(): void {
    this.state = { ...LASER_IDLE };
    this.scorches = [];
    this.draw();
  }

  spawn(ctx: WorldContext): void {
    const m = ctx.monster.position;
    const a = ctx.rng() * Math.PI * 2;
    this.state = startLaser(this.state, { x: m.x + Math.cos(a) * L.startOffset, z: m.z + Math.sin(a) * L.startOffset });
  }

  update(dt: number, ctx: WorldContext): void {
    this.time += dt;
    const m = ctx.monster.position;
    const before = this.state.phase;
    this.state = stepLaser(this.state, dt, { x: m.x, z: m.z }, ctx.rng());
    const s = this.state;
    if (s.phase === 'firing') {
      if (before !== 'firing') ctx.shake(0.4);
      ctx.shake(0.08);
      if (ctx.monster.alive && laserHits(s, { x: m.x, z: m.z })) ctx.damageMonster(L.dps * dt, 'laser');
      ctx.damageBuildings({ x: s.x, z: s.z }, L.radius, L.buildingDps * dt);
      ctx.particles.emit('fire', _p.set(s.x, 5, s.z), 2, 1.2);
      ctx.particles.emit('smoke', _p.set(s.x, 20, s.z), 1, 1.5);
    }
    if (before === 'firing' && s.phase === 'cooldown') {
      if (this.scorches.length >= MAX_SCORCH) this.scorches.shift();
      this.scorches.push({ x: s.x, z: s.z, age: 0 });
    }
    for (const sc of this.scorches) sc.age += dt;
    this.scorches = this.scorches.filter((sc) => sc.age < L.scorchLife);
    this.draw();
  }

  private draw(): void {
    const s = this.state;
    const show = s.phase === 'tracking' || s.phase === 'locked' || s.phase === 'firing';
    this.beam.visible = this.glow.visible = show;
    this.core.visible = s.phase === 'firing';
    if (show) {
      const firing = s.phase === 'firing';
      const r = firing ? L.radius : s.phase === 'locked' ? 26 : 16 + Math.sin(this.time * 12) * 3;
      this.beam.position.set(s.x, 0, s.z);
      this.beam.scale.set(r, L.beamHeight, r);
      this.beamMat.opacity = firing ? 0.85 : s.phase === 'locked' ? 0.6 : 0.22 + 0.08 * Math.sin(this.time * 8);
      this.core.position.set(s.x, 0, s.z);
      this.core.scale.set(L.radius * 0.45, L.beamHeight, L.radius * 0.45);
      this.glow.position.set(s.x, 4, s.z);
      this.glow.scale.setScalar(firing ? L.radius * 1.4 : L.radius);
      this.glowMat.opacity = firing ? 0.7 : 0.25;
    }
    this.scorches.forEach((sc, i) => {
      _m.compose(_p.set(sc.x, 1.5, sc.z), _q.identity(), _s.set(L.radius, 1, L.radius).multiplyScalar(1 - (sc.age / L.scorchLife) * 0.3));
      this.scorch.setMatrixAt(i, _m);
    });
    this.scorch.count = this.scorches.length;
    this.scorch.instanceMatrix.needsUpdate = true;
  }
}
