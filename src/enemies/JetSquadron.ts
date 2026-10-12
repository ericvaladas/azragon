import * as THREE from 'three';
import { CONFIG } from '../config';
import type { OnDestroyed, Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import { steerToward } from './steer';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Mode = 'attack' | 'exit' | 'crashing';
const S = CONFIG.jet.size;
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
  vy = 0;
  trailT = 0;
  flashT = 0;

  constructor(
    readonly material: THREE.MeshToonMaterial,
    private onDamage: (j: Jet, amount: number) => void,
  ) {}

  isAlive(): boolean {
    return this.mode !== 'crashing';
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/** Jets fly strafing passes: attack run past the monster's head, fire a salvo, exit, loop back. */
export class JetSquadron {
  onTrail: (p: THREE.Vector3) => void = () => {};
  onCrash: (p: THREE.Vector3) => void = () => {};
  private jets: Jet[] = [];
  /** Fuselage, wings and tail fin merged so each jet is one draw call. */
  private body = mergeGeometries([
    faceted(new THREE.BoxGeometry(S * 0.22, S * 0.18, S)),
    faceted(new THREE.BoxGeometry(S * 0.95, S * 0.04, S * 0.32)).translate(0, 0, -S * 0.05),
    faceted(new THREE.BoxGeometry(S * 0.04, S * 0.26, S * 0.2)).translate(0, S * 0.15, -S * 0.4),
  ])!;

  constructor(
    private scene: THREE.Scene,
    private onDestroyed: OnDestroyed,
    private fire: (from: THREE.Vector3, to: THREE.Vector3, damage: number) => void,
  ) {}

  targets(): readonly Target[] {
    return this.jets;
  }

  count(): number {
    return this.jets.filter((j) => j.mode !== 'crashing').length;
  }

  clear(): void {
    for (const j of this.jets) this.scene.remove(j.group);
    this.jets = [];
  }

  spawn(around: THREE.Vector3, rng: () => number): void {
    const mat = toonMat(CONFIG.palette.jet);
    const j = new Jet(mat, this.damage);
    const mesh = new THREE.Mesh(this.body, mat);
    mesh.castShadow = true;
    j.group.add(mesh);
    const a = rng() * Math.PI * 2;
    const r = CONFIG.director.spawnRing * 1.2;
    j.position.set(around.x + Math.cos(a) * r, CONFIG.jet.altitude, around.z + Math.sin(a) * r);
    j.dir.set(-Math.cos(a), 0, -Math.sin(a));
    j.offset.set((rng() - 0.5) * 400, (rng() - 0.5) * 120, (rng() - 0.5) * 400);
    this.scene.add(j.group);
    this.jets.push(j);
  }

  private damage = (j: Jet, amount: number): void => {
    if (j.mode === 'crashing') return;
    j.hp -= amount;
    j.flashT = 0.1;
    if (j.hp <= 0) {
      j.mode = 'crashing';
      j.spin = (Math.random() < 0.5 ? -1 : 1) * 4;
      this.onDestroyed(j, CONFIG.jet.exp);
    }
  };

  update(dt: number, monster: THREE.Vector3): void {
    const J = CONFIG.jet;
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
          this.onTrail(j.position);
        }
        if (j.position.y <= 0) {
          this.onCrash(j.position.clone().setY(0));
          this.scene.remove(j.group);
          this.jets.splice(i, 1);
          continue;
        }
      } else {
        if (j.mode === 'attack') {
          j.waypoint.copy(monster).add(j.offset).setY(J.altitude + j.offset.y);
          const dm = j.position.distanceTo(monster);
          if (!j.salvoFired && dm >= J.salvoMin && dm <= J.salvoMax) {
            j.salvoFired = true;
            for (let k = 0; k < J.rocketsPerSalvo; k++) {
              const aim = monster.clone().add(new THREE.Vector3((Math.random() - 0.5) * 200, 250 + Math.random() * 250, (Math.random() - 0.5) * 200));
              this.fire(j.position.clone(), aim, J.damage);
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
