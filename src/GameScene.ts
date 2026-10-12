import * as THREE from 'three';
import { CONFIG } from './config';
import { GameEventEmitter, type GameState } from './GameEvents';
import { Lighting } from './render/Lighting';
import { PixelRenderer } from './render/PixelRenderer';
import { createSky } from './render/Sky';
import { clampDelta, type Vec2 } from './util/math';
import type { Target } from './combat';
import { City } from './world/City';
import { Monster } from './monster/Monster';
import { CameraRig } from './systems/CameraRig';
import { Input } from './systems/Input';
import { Markers } from './systems/Markers';
import { pickEnemy } from './systems/tap';
import { Particles } from './systems/Particles';
import { Projectiles, type Hit } from './systems/Projectiles';
import { spikeTargets } from './systems/projectileMath';
import { SpawnDirector } from './enemies/SpawnDirector';
import { TankFleet } from './enemies/TankFleet';
import { JetSquadron } from './enemies/JetSquadron';
import { mulberry32 } from './util/rng';
import { decide, nearestInRange, type BrainOrder, type BrainTarget } from './monster/brain';
import { generateCityLayout } from './world/cityLayout';

type Order = { kind: 'move'; to: Vec2 } | { kind: 'attack'; target: Target } | null;

export class GameScene {
  readonly events = new GameEventEmitter();

  private state: GameState = 'loading';
  private pixel: PixelRenderer;
  private lighting: Lighting;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 5, 12000);
  private clock = new THREE.Clock();
  private animationFrameId = 0;
  private resizeObserver: ResizeObserver;
  private city: City;
  private kills = 0;
  private monster: Monster;
  private elapsed = 0;
  private rig: CameraRig;
  private input: Input;
  private markers: Markers;
  private order: Order = null;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmpV = new THREE.Vector3();
  private particles: Particles;
  private projectiles: Projectiles;
  private director: SpawnDirector;
  private tanks: TankFleet;
  private jets: JetSquadron;
  private rng = mulberry32(CONFIG.world.seed + 7);

  constructor(private container: HTMLDivElement) {
    this.pixel = new PixelRenderer(container);
    this.lighting = new Lighting(this.scene);
    this.lighting.attachSky(createSky(this.scene));

    this.city = new City(this.scene, generateCityLayout(CONFIG.world.seed), this.onTargetDestroyed);
    this.monster = new Monster(this.scene);
    this.rig = new CameraRig(this.camera);
    this.markers = new Markers(this.scene);
    this.particles = new Particles(this.scene);
    this.projectiles = new Projectiles(this.scene);
    this.projectiles.onTrail = (p) => this.particles.emit('smoke', p, 1, 0.2);
    this.projectiles.onHit = this.onProjectileHit;
    this.director = new SpawnDirector(this.rng);
    const fire = (from: THREE.Vector3, to: THREE.Vector3, damage: number, kind: 'shell' | 'rocket') => {
      if (kind === 'shell') this.projectiles.fireShell(from, to, damage);
      else this.projectiles.fireRocket(from, to, damage);
      this.particles.emit('fire', from, 2, 0.3);
    };
    this.tanks = new TankFleet(this.scene, this.city.layout, this.onTargetDestroyed, (f, t, d) => fire(f, t, d, 'shell'));
    this.jets = new JetSquadron(this.scene, this.onTargetDestroyed, (f, t, d) => fire(f, t, d, 'rocket'));
    this.jets.onTrail = (p) => this.particles.emit('smoke', p, 1, 0.3);
    this.jets.onCrash = (p) => {
      this.particles.explosion(p, 2);
      this.particles.ring('dust', p, 120, 12);
      this.rig.addTrauma(0.3);
    };
    this.city.onCollapseStart = (pos, size) => {
      this.particles.ring('dust', pos, size, 14);
      this.particles.emit('debris', pos.clone().setY(30), 8);
      this.rig.addTrauma(0.12);
    };
    this.monster.onFootLand = (p) => {
      this.particles.ring('dust', p, 60, 7);
      this.rig.addTrauma(0.06);
    };
    this.monster.onMeleeImpact = (p) => this.meleeImpact(p);
    this.input = new Input(this.pixel.domElement, {
      tap: this.onTap,
      drag: (dx, dy) => this.rig.drag(dx, dy),
      wheel: (dy) => this.rig.zoom(dy),
      hover: this.onHover,
    });

    this.lighting.follow(new THREE.Vector3());

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(container);
    this.clock.start();
    this.update();
    this.setState('playing');
  }

  getState(): GameState {
    return this.state;
  }

  restart(): void {
    this.setState('playing');
  }

  private setState(next: GameState): void {
    if (this.state === next) return;
    this.state = next;
    this.events.emit('stateChange', next);
  }

  private onResize = (entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) return;
    const { width: w, height: h } = entry.contentRect;
    if (w === 0 || h === 0) return;
    this.pixel.resize(w, h);
    this.rig.setAspect(w / h);
  };

  private update = () => {
    this.animationFrameId = requestAnimationFrame(this.update);
    const dt = clampDelta(this.clock.getDelta());
    this.elapsed += dt;
    if (this.state === 'playing') {
      for (const kind of this.director.update(dt, { tanks: this.tanks.count(), jets: this.jets.count() })) {
        if (kind === 'tank') this.tanks.spawn(this.monster.position, this.rng);
        else this.jets.spawn(this.monster.position, this.rng);
      }
      this.tanks.update(dt, this.monster.position);
      this.updateMonster(dt);
    }
    this.jets.update(dt, this.monster.position);
    this.monster.animate(dt, this.elapsed);
    this.markers.update(dt);
    this.projectiles.update(dt);
    this.particles.update(dt);
    this.rig.update(dt, this.monster.position);
    this.lighting.follow(this.monster.position);
    this.city.update(dt);
    this.lighting.followCamera(this.camera);
    this.pixel.render(this.scene, this.camera);
  };

  /** Enemies the player can target. Filled in by Task 9. */
  enemyTargets(): Target[] {
    return [...this.tanks.targets(), ...this.jets.targets()].filter((t) => t.isAlive());
  }

  private setRay(x: number, y: number): void {
    const el = this.pixel.domElement;
    this.ndc.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  /** Enemy within the pick radius on screen, else building under the ray. */
  private pickTarget(x: number, y: number): Target | null {
    const enemies = this.enemyTargets();
    const el = this.pixel.domElement;
    const pts = enemies.map((t, index) => {
      this.tmpV.copy(t.position).project(this.camera);
      return {
        index,
        x: (this.tmpV.x * 0.5 + 0.5) * el.clientWidth,
        y: (-this.tmpV.y * 0.5 + 0.5) * el.clientHeight,
        visible: this.tmpV.z < 1 && t.isAlive(),
      };
    });
    const hit = pickEnemy(pts, x, y, CONFIG.input.pickRadiusPx);
    if (hit !== null) return enemies[hit]!;
    this.setRay(x, y);
    const b = this.raycaster.intersectObject(this.city.buildingMesh)[0];
    return b?.instanceId !== undefined ? this.city.targetForInstance(b.instanceId) : null;
  }

  private onTap = (x: number, y: number): void => {
    if (this.state !== 'playing') return;
    const target = this.pickTarget(x, y);
    if (target) {
      this.order = { kind: 'attack', target };
      this.markers.setTarget(target);
      return;
    }
    this.setRay(x, y);
    const p = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
    if (!p) return;
    const lim = CONFIG.world.citySize / 2;
    p.x = Math.min(lim, Math.max(-lim, p.x));
    p.z = Math.min(lim, Math.max(-lim, p.z));
    this.order = { kind: 'move', to: { x: p.x, z: p.z } };
    this.markers.setTarget(null);
    this.markers.tapAt(p);
  };

  private onHover = (x: number, y: number): void => {
    const t = this.state === 'playing' ? this.pickTarget(x, y) : null;
    this.markers.setHover(t);
    this.container.classList.toggle('can-target', t !== null);
  };

  private toBrain(t: Target): BrainTarget {
    return { x: t.position.x, z: t.position.z, radius: t.radius, airborne: t.airborne, alive: t.isAlive() };
  }

  private meleeImpact(p: THREE.Vector3): void {
    const r = CONFIG.monster.meleeRadius;
    const dmg = CONFIG.monster.meleeDamage;
    this.city.forEachStandingInRadius({ x: p.x, z: p.z }, r, (t) => t.applyDamage(dmg));
    for (const t of this.enemyTargets()) {
      if (!t.airborne && t.isAlive() && Math.hypot(t.position.x - p.x, t.position.z - p.z) <= r + t.radius) t.applyDamage(dmg);
    }
    this.particles.ring('dust', p, r, 18);
    this.particles.emit('debris', p.clone().setY(10), 10, 1.3);
    this.rig.addTrauma(0.35);
  }

  /** Order → brain → monster actions. Task 8 handles 'ranged'; Task 10 adds stat multipliers. */
  private updateMonster(dt: number): void {
    const m = this.monster;
    const pos = { x: m.position.x, z: m.position.z };
    const auto = nearestInRange(pos, this.enemyTargets(), CONFIG.monster.spikeRange);
    const order: BrainOrder =
      this.order?.kind === 'attack' ? { kind: 'attack', target: this.toBrain(this.order.target) } : this.order;
    const d = decide({
      pos,
      order,
      auto: auto ? this.toBrain(auto) : null,
      meleeRange: CONFIG.monster.meleeRange,
      spikeRange: CONFIG.monster.spikeRange,
      meleeReady: m.meleeReady(),
      spikeReady: m.spikeReady(),
      arriveRadius: CONFIG.monster.arriveRadius,
    });
    if (d.orderDone) {
      this.order = null;
      this.markers.setTarget(null);
    }
    if (d.moveTo) m.moveToward(d.moveTo, dt, 1);
    else if (d.face) m.faceToward(d.face, dt);
    if (d.attack === 'melee') m.startMelee(1);
    if (d.attack === 'ranged') this.fireSpikes(d.attackOn === 'order' && this.order?.kind === 'attack' ? this.order.target : auto);
    m.tick(dt);

    this.city.forEachStandingInRadius(pos, CONFIG.monster.bodyRadius, (t) => t.applyDamage(CONFIG.monster.contactDps * dt));
  }

  private fireSpikes(target: Target | null): void {
    if (!target) return;
    const m = this.monster;
    const count = 1; // Task 10: + progression.stats.extraSpikes
    const pos = { x: m.position.x, z: m.position.z };
    const others = this.enemyTargets()
      .filter((t) => t.isAlive() && Math.hypot(t.position.x - pos.x, t.position.z - pos.z) <= CONFIG.monster.spikeRange)
      .sort((a, b) => a.position.distanceToSquared(target.position) - b.position.distanceToSquared(target.position));
    const from = m.model.stingerTip.getWorldPosition(new THREE.Vector3());
    spikeTargets(target, others, count).forEach((t, i) => {
      this.projectiles.fireSpike(from, t, CONFIG.monster.spikeDamage, (i - (count - 1) / 2) * CONFIG.monster.spikeSpreadRad);
    });
    this.particles.emit('spark', from, 4);
    m.consumeSpike(1);
  }

  private onProjectileHit = (h: Hit): void => {
    if (h.kind === 'spike') {
      h.target?.applyDamage(h.damage);
      this.particles.emit('spark', h.point, 6);
      this.particles.emit('fire', h.point, 3, 0.5);
      return;
    }
    this.particles.explosion(h.point, 0.6);
    if (this.monster.alive) {
      this.monster.hp = Math.max(0, this.monster.hp - h.damage);
      this.monster.flash();
      this.rig.addTrauma(0.05);
    }
  };

  // Task 10 adds EXP; until then only kills are counted.
  private onTargetDestroyed = (target: Target, exp: number): void => {
    if (target.kind === 'tank') this.particles.explosion(target.position, 1);
    if (target.kind === 'jet') this.particles.explosion(target.position, 1.2);
    if (target.kind !== 'building') this.kills++;
    void exp;
  };

  dispose(): void {
    this.input.dispose();
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.pixel.dispose();
    this.events.removeAll();
  }
}
