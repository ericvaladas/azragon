import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import type { EnemySystem, WorldContext } from './types';
import { toonMat } from '../render/toon';
import { burnerGeometry, jetGeometry } from './jetModel';
import { steerToward } from './steer';
import { escaped, fleePoint } from './retreat';

type Mode = 'attack' | 'exit' | 'crashing';
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

class Jet implements Target {
  readonly kind = 'jet' as const;
  readonly airborne = true;
  readonly radius = CONFIG.jet.hitRadius;
  readonly group = new THREE.Group();
  readonly position = this.group.position;
  readonly dir = new THREE.Vector3(0, 0, 1);
  readonly waypoint = new THREE.Vector3();
  readonly offset = new THREE.Vector3();
  hp: number = CONFIG.jet.hp;
  mode: Mode = 'attack';
  salvoFired = false;
  bank = 0;
  spin = 0;
  /** Taken quietly: it vanishes below the ground instead of crashing. */
  silent = false;
  /** Out of the scene: crashed into the ground, flown off, or cleared. */
  gone = false;
  vy = 0;
  trailT = 0;
  flashT = 0;

  constructor(
    readonly material: THREE.MeshToonMaterial,
    private onDamage: (j: Jet, amount: number) => void,
  ) {}

  isAlive(): boolean {
    return this.mode !== 'crashing' && !this.gone;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/**
 * Jets fly strafing passes: attack run past the monster's head, fire a salvo, exit, loop back. While the army
 * retreats they fire nothing and fly out of the map.
 */
export class JetSquadron implements EnemySystem {
  readonly kind = 'jet' as const;
  private ctx: WorldContext | null = null;
  private jets: Jet[] = [];
  /** Airframe (one vertex-coloured mesh per jet, sharing this geometry) and the unlit afterburner flame. */
  private body = jetGeometry();
  private burnerGeo = burnerGeometry();
  private burnerMat = new THREE.MeshBasicMaterial({ color: CONFIG.palette.jetBurner });

  constructor(private scene: THREE.Scene) {}

  targets(): readonly Target[] {
    return this.jets;
  }

  count(): number {
    return this.jets.filter((j) => j.mode !== 'crashing').length;
  }

  clear(): void {
    for (const j of this.jets) {
      j.gone = true;
      this.scene.remove(j.group);
    }
    this.jets = [];
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    const around = ctx.monster.position;
    const rng = ctx.rng;
    const mat = toonMat(0xffffff, { vertexColors: true });
    const j = new Jet(mat, this.damage);
    const mesh = new THREE.Mesh(this.body, mat);
    mesh.castShadow = true;
    j.group.add(mesh, new THREE.Mesh(this.burnerGeo, this.burnerMat));
    const d = ctx.spawnDir();
    const r = CONFIG.director.spawnRing * 1.2;
    j.hp = CONFIG.jet.hp * ctx.difficulty.hpMult;
    j.position.set(around.x + d.x * r, CONFIG.jet.altitude, around.z + d.z * r);
    j.dir.set(-d.x, 0, -d.z);
    j.offset.set((rng() - 0.5) * 400, (rng() - 0.5) * 120, (rng() - 0.5) * 400);
    this.scene.add(j.group);
    this.jets.push(j);
  }

  private damage = (j: Jet, amount: number): void => {
    if (!j.isAlive()) return;
    j.hp -= amount;
    j.flashT = 0.1;
    if (j.hp <= 0) {
      j.mode = 'crashing';
      j.spin = (Math.random() < 0.5 ? -1 : 1) * 4;
      if (this.ctx?.quiet) {
        j.silent = true;
        j.position.y = -1;
      }
      this.ctx?.onDestroyed(j, CONFIG.jet.exp);
    }
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    const monster = ctx.monster.position;
    const J = CONFIG.jet;
    const retreating = ctx.retreating === true;
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i]!;
      j.flashT = Math.max(0, j.flashT - dt);
      j.material.emissive.setHex(j.flashT > 0 ? 0xffffff : 0x000000);

      if (j.mode === 'crashing') {
        j.vy -= 120 * dt;
        j.position.addScaledVector(j.dir, J.speed * 0.8 * dt);
        j.position.y += j.vy * dt;
        j.bank += j.spin * dt;
        j.trailT += dt;
        if (j.trailT > 0.05) {
          j.trailT = 0;
          ctx.particles.emit('smoke', j.position, 1, 0.3);
        }
        if (j.position.y <= 0) {
          if (!j.silent) {
            const p = j.position.clone().setY(0);
            ctx.particles.explosion(p, 2);
            ctx.particles.ring('dust', p, 120, 12);
            ctx.splash(p, 2);
            ctx.shake(0.3);
          }
          j.gone = true;
          this.scene.remove(j.group);
          this.jets.splice(i, 1);
          continue;
        }
      } else if (retreating && escaped(j.position, monster)) {
        j.gone = true;
        this.scene.remove(j.group);
        this.jets.splice(i, 1);
        continue;
      } else {
        if (retreating) {
          // Out of the map: no salvo, and the exit waypoint is never reached for a loop back.
          j.mode = 'exit';
          const away = fleePoint(j.position, monster, CONFIG.cycle.exitDistance + 200);
          j.waypoint.set(away.x, J.altitude, away.z);
        } else if (j.mode === 'attack') {
          j.waypoint.copy(monster).add(j.offset).setY(J.altitude + j.offset.y);
          const dm = j.position.distanceTo(monster);
          if (!j.salvoFired && dm >= J.salvoMin && dm <= J.salvoMax) {
            j.salvoFired = true;
            for (let k = 0; k < J.rocketsPerSalvo; k++) {
              const aim = monster.clone().add(new THREE.Vector3((Math.random() - 0.5) * 200, (250 + Math.random() * 250) * CONFIG.monster.scale, (Math.random() - 0.5) * 200));
              ctx.fireRocket(j.position.clone(), aim, J.damage);
            }
          }
          if (j.position.distanceTo(j.waypoint) < 300) {
            j.mode = 'exit';
            j.waypoint.copy(j.position).addScaledVector(j.dir, J.exitDistance).setY(J.altitude);
          }
        } else if (j.position.distanceTo(j.waypoint) < 250) {
          j.mode = 'attack';
          j.salvoFired = false;
        }
        _desired.subVectors(j.waypoint, j.position).normalize();
        const turn = steerToward(j.dir, _desired, J.turnRate * dt);
        const targetBank = -Math.sign(turn) * Math.min(1, Math.abs(turn) / (J.turnRate * dt + 1e-6)) * 0.9;
        j.bank += (targetBank - j.bank) * (1 - Math.exp(-4 * dt));
        j.position.addScaledVector(j.dir, J.speed * dt);
      }

      j.group.lookAt(_look.copy(j.position).add(j.dir));
      j.group.rotateZ(j.bank);
    }
  }
}
