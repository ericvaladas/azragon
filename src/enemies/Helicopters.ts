import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { toonMat } from '../render/toon';
import type { EnemySystem, WorldContext } from './types';
import { heliPosition, newHeliState, orbitDir, stepHeli, type HeliState } from './heliMath';
import { MAIN_ROTOR, PODS, TAIL_ROTOR, bodyGeometry, mainRotorGeometry, rotorDiscGeometry, tailRotorGeometry } from './heliModel';

const H = CONFIG.heli;
const _look = new THREE.Vector3();
const _from = new THREE.Vector3();
const _fwd = new THREE.Vector3();

class Heli implements Target {
  readonly kind = 'heli' as const;
  readonly airborne = true;
  readonly radius = H.hitRadius;
  readonly group = new THREE.Group();
  readonly position = this.group.position;
  readonly rotor = new THREE.Group();
  readonly tail = new THREE.Group();
  hp: number;
  crashing = false;
  flashT = 0;
  /** Crash fall: vertical speed, yaw spin (rad/s) and the trail clock. */
  vy = 0;
  spin = 0;
  /** Taken quietly: it vanishes below the ground instead of crashing. */
  silent = false;
  trailT = 0;
  rotorSpeed: number = H.rotorSpin;
  /** Volleys alternate pods. */
  pod = 0;

  constructor(
    readonly state: HeliState,
    readonly material: THREE.MeshToonMaterial,
    hp: number,
    private onDamage: (h: Heli, amount: number) => void,
  ) {
    this.hp = hp;
  }

  isAlive(): boolean {
    return !this.crashing;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Attack helicopters: fly in from the map edge, circle the monster and fire rocket volleys at it. */
export class Helicopters implements EnemySystem {
  readonly kind = 'heli' as const;
  private ctx: WorldContext | null = null;
  private helis: Heli[] = [];
  private spawned = 0;
  private body = bodyGeometry();
  private rotorGeo = mainRotorGeometry();
  private discGeo = rotorDiscGeometry();
  private tailGeo = tailRotorGeometry();
  private rotorMat = toonMat(CONFIG.palette.heliRotor);
  private discMat = new THREE.MeshBasicMaterial({ color: CONFIG.palette.heliRotor, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

  constructor(private scene: THREE.Scene) {}

  targets(): readonly Target[] {
    return this.helis;
  }

  count(): number {
    return this.helis.filter((h) => !h.crashing).length;
  }

  /** Orbit direction (+1 / -1) of each helicopter, in spawn order. */
  orbitDirs(): number[] {
    return this.helis.map((h) => h.state.dir);
  }

  clear(): void {
    for (const h of this.helis) this.scene.remove(h.group);
    this.helis = [];
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.count() >= CONFIG.spawns.heli.cap) return;
    const m = ctx.monster.position;
    const d = ctx.spawnDir();
    // Heli bearings put x on cos, z on sin.
    const bearing = Math.atan2(d.z, d.x);
    const dist = H.spawnMin + ctx.rng() * (H.spawnMax - H.spawnMin);
    const state = newHeliState(m, bearing, dist, orbitDir(this.spawned++));
    const mat = toonMat(0xffffff, { vertexColors: true });
    const h = new Heli(state, mat, H.hp * ctx.difficulty.hpMult, this.damage);
    const body = new THREE.Mesh(this.body, mat);
    body.castShadow = true;
    const blades = new THREE.Mesh(this.rotorGeo, this.rotorMat);
    blades.castShadow = true;
    h.rotor.add(blades, new THREE.Mesh(this.discGeo, this.discMat));
    h.rotor.position.copy(MAIN_ROTOR);
    h.tail.add(new THREE.Mesh(this.tailGeo, this.rotorMat));
    h.tail.position.copy(TAIL_ROTOR);
    h.group.add(body, h.rotor, h.tail);
    const p = heliPosition(state);
    h.position.set(p.x, p.y, p.z);
    this.pose(h);
    this.scene.add(h.group);
    this.helis.push(h);
  }

  private damage = (h: Heli, amount: number): void => {
    if (h.crashing) return;
    h.hp -= amount;
    h.flashT = 0.1;
    if (h.hp > 0) return;
    h.crashing = true;
    h.spin = (Math.random() < 0.5 ? -1 : 1) * 3;
    if (this.ctx?.quiet) {
      h.silent = true;
      h.position.y = -1;
    } else this.ctx?.particles.explosion(h.position, 1);
    this.ctx?.onDestroyed(h, H.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const monster = ctx.monster.position;
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i]!;
      const s = h.state;
      h.flashT = Math.max(0, h.flashT - dt);
      h.material.emissive.setHex(h.flashT > 0 ? 0xffffff : 0x000000);

      if (h.crashing) {
        // Tail-rotor loss: it spins about its mast, drifts on along its heading and drops out of the sky.
        h.vy -= 120 * dt;
        h.position.x += Math.sin(s.heading) * H.orbitSpeed * 0.5 * dt;
        h.position.z += Math.cos(s.heading) * H.orbitSpeed * 0.5 * dt;
        h.position.y += h.vy * dt;
        s.heading += h.spin * dt;
        s.bank += (h.spin * 0.12 - s.bank) * (1 - Math.exp(-2 * dt));
        h.rotorSpeed = Math.max(4, h.rotorSpeed - 6 * dt);
        h.trailT += dt;
        if (h.trailT > 0.05) {
          h.trailT = 0;
          ctx.particles.emit('smoke', h.position, 1, 0.3);
        }
        if (h.position.y <= 0) {
          if (!h.silent) {
            const p = h.position.clone().setY(0);
            ctx.particles.explosion(p, 2);
            ctx.particles.ring('dust', p, 120, 12);
            ctx.splash(p, 2);
            ctx.shake(0.3);
          }
          this.scene.remove(h.group);
          this.helis.splice(i, 1);
          continue;
        }
      } else {
        const rockets = stepHeli(s, monster, dt);
        const p = heliPosition(s);
        h.position.set(p.x, p.y, p.z);
        if (rockets > 0) this.volley(h, rockets, ctx);
      }
      this.pose(h);
      h.rotor.rotation.y += h.rotorSpeed * dt;
      h.tail.rotation.x += H.tailRotorSpin * dt;
    }
  }

  private volley(h: Heli, rockets: number, ctx: WorldContext): void {
    this.pose(h);
    h.group.updateMatrixWorld();
    const monster = ctx.monster.position;
    for (let k = 0; k < rockets; k++) {
      _from.copy(PODS[h.pod++ % 2]!).applyMatrix4(h.group.matrixWorld);
      const aim = monster.clone().add(new THREE.Vector3((Math.random() - 0.5) * 200, (250 + Math.random() * 250) * CONFIG.monster.scale, (Math.random() - 0.5) * 200));
      ctx.fireRocket(_from.clone(), aim, CONFIG.jet.damage);
    }
  }

  /** Faces the heading, noses down with speed, and rolls into the turn. */
  private pose(h: Heli): void {
    const s = h.state;
    _fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    h.group.lookAt(_look.copy(h.position).add(_fwd));
    h.group.rotateX(s.pitch);
    h.group.rotateZ(s.bank);
  }
}
