import * as THREE from 'three';
import { CONFIG } from './config';
import { GameEventEmitter, type GameState } from './GameEvents';
import { Lighting } from './render/Lighting';
import { PixelRenderer } from './render/PixelRenderer';
import { createSky } from './render/Sky';
import { clampDelta, type Vec2 } from './util/math';
import type { Target } from './combat';
import { City } from './world/City';
import { ringOnRoads } from './world/roads';
import { ROAD_ORIGIN } from './world/chunks';
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
import { Progression, expToNext } from './systems/Progression';
import { regen } from './monster/vitals';
import { DebugOverlay } from './systems/DebugOverlay';
import { decide, nearestInRange, type BrainOrder, type BrainTarget } from './monster/brain';

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
  private progression = new Progression(mulberry32(CONFIG.world.seed + 13));
  private runTime = 0;
  private openingDone = false;
  private dyingT = 0;
  private hudT = 0;
  private stateBeforePause: GameState = 'playing';
  private debug: DebugOverlay | null = null;

  constructor(private container: HTMLDivElement) {
    this.pixel = new PixelRenderer(container);
    this.lighting = new Lighting(this.scene);
    this.lighting.attachSky(createSky(this.scene));

    this.city = new City(this.scene, CONFIG.world.seed, this.onTargetDestroyed);
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
    this.tanks = new TankFleet(this.scene, this.onTargetDestroyed, (f, t, d) => fire(f, t, d, 'shell'));
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
    if (new URLSearchParams(location.search).has('debug')) this.debug = new DebugOverlay(this.container);

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(container);
    this.clock.start();
    this.update();
    this.setState('playing');
  }

  getState(): GameState {
    return this.state;
  }

  /** Called by the React level-up cards. */
  chooseUpgrade(id: string, seq: number): void {
    if (this.state !== 'levelup' || !this.progression.choose(id, seq)) return;
    const s = this.progression.stats;
    const m = this.monster;
    const newMax = Math.round(CONFIG.monster.maxHp * s.maxHpMult);
    if (id === 'vitality') m.hp = Math.min(newMax, m.hp + newMax * 0.3);
    m.maxHp = newMax;
    this.emitHud();
    if (this.progression.pendingLevels > 0) this.emitOffer();
    else this.setState('playing');
  }

  pause(): void {
    if (this.state === 'paused' || this.state === 'gameover') return;
    this.stateBeforePause = this.state;
    this.setState('paused');
  }

  resume(): void {
    if (this.state === 'paused') this.setState(this.stateBeforePause);
  }

  restart(): void {
    this.city.reset();
    this.tanks.clear();
    this.jets.clear();
    this.projectiles.clear();
    this.particles.clear();
    this.monster.reset();
    this.progression.reset();
    this.director.reset();
    this.rig.reset();
    this.order = null;
    this.markers.setTarget(null);
    this.kills = 0;
    this.runTime = 0;
    this.openingDone = false;
    this.dyingT = 0;
    this.setState('playing');
    this.emitHud();
  }

  private enterLevelUp(): void {
    this.setState('levelup');
    this.emitOffer();
    this.emitHud();
  }

  private emitOffer(): void {
    const offers = this.progression.offer();
    this.events.emit('levelUpOffer', { seq: this.progression.offerSeq, offers });
  }

  private emitHud(): void {
    const m = this.monster;
    this.events.emit('hud', {
      hp: Math.ceil(m.hp),
      maxHp: m.maxHp,
      exp: this.progression.exp,
      expToNext: expToNext(this.progression.level),
      level: this.progression.level,
      timeSec: Math.floor(this.runTime),
    });
  }

  private startDying(): void {
    this.monster.alive = false;
    this.order = null;
    this.markers.setTarget(null);
    this.dyingT = 0;
    this.setState('dying');
    this.particles.ring('dust', this.monster.position, 400, 30);
    this.rig.addTrauma(0.8);
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
    const raw = this.clock.getDelta();
    const dt = clampDelta(raw);
    const frozen = this.state === 'levelup' || this.state === 'paused' || this.state === 'loading';

    if (!frozen) {
      this.elapsed += dt;
      if (this.state === 'playing') {
        this.runTime += dt;
        if (!this.openingDone && this.runTime >= CONFIG.opening.time) {
          this.openingDone = true;
          const c = { x: this.monster.position.x, z: this.monster.position.z };
          for (const p of ringOnRoads(c, CONFIG.opening.count, CONFIG.opening.radius, ROAD_ORIGIN, CONFIG.world.blockSize)) this.tanks.spawnAt(p.x, p.z, this.rng);
        }
        for (const kind of this.director.update(dt, { tanks: this.tanks.count(), jets: this.jets.count() })) {
          if (kind === 'tank') this.tanks.spawn(this.monster.position, this.rng);
          else this.jets.spawn(this.monster.position, this.rng);
        }
        this.tanks.update(dt, this.monster.position);
        this.updateMonster(dt);
        if (this.monster.hp <= 0 && this.monster.alive) this.startDying();
      }
      if (this.state === 'dying') {
        this.dyingT += dt;
        this.monster.pose.collapse = Math.min(1, this.dyingT / CONFIG.monster.deathTime);
        if (this.dyingT >= CONFIG.monster.deathTime) {
          this.setState('gameover');
          this.events.emit('gameOver', {
            timeSec: Math.floor(this.runTime),
            kills: this.kills,
            buildings: this.city.destroyedCount(),
            level: this.progression.level,
          });
        }
      }
      this.jets.update(dt, this.monster.position);
      this.projectiles.update(dt);
      this.city.update(dt, this.monster.position);
      this.monster.animate(dt, this.elapsed);
      this.particles.update(dt);
      this.markers.update(dt);

      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 1 / CONFIG.hudHz;
        this.emitHud();
      }
    }

    this.rig.update(frozen ? 0 : dt, this.monster.position);
    this.lighting.follow(this.monster.position);
    this.lighting.followCamera(this.camera);
    this.pixel.render(this.scene, this.camera);
    this.debug?.update(raw, this.pixel.renderer.info);
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
    return this.city.pickBuilding(this.raycaster.ray);
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
    const s = this.progression.stats;
    const r = CONFIG.monster.meleeRadius * s.stompRadiusMult;
    const dmg = CONFIG.monster.meleeDamage * s.damageMult;
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
    const s = this.progression.stats;
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
    if (d.moveTo) m.moveToward(d.moveTo, dt, s.moveSpeedMult);
    else if (d.face) m.faceToward(d.face, dt);
    if (d.attack === 'melee') m.startMelee(s.cooldownMult);
    if (d.attack === 'ranged') this.fireSpikes(d.attackOn === 'order' && this.order?.kind === 'attack' ? this.order.target : auto);
    m.tick(dt);

    this.city.forEachStandingInRadius(pos, CONFIG.monster.bodyRadius, (t) => t.applyDamage(CONFIG.monster.contactDps * dt));
    m.hp = regen(m.hp, m.maxHp, CONFIG.monster.regenPerSec + s.regenBonus, dt);
  }

  private fireSpikes(target: Target | null): void {
    if (!target) return;
    const m = this.monster;
    const s = this.progression.stats;
    const count = 1 + s.extraSpikes;
    const pos = { x: m.position.x, z: m.position.z };
    const others = this.enemyTargets()
      .filter((t) => t.isAlive() && Math.hypot(t.position.x - pos.x, t.position.z - pos.z) <= CONFIG.monster.spikeRange)
      .sort((a, b) => a.position.distanceToSquared(target.position) - b.position.distanceToSquared(target.position));
    const from = m.model.stingerTip.getWorldPosition(new THREE.Vector3());
    spikeTargets(target, others, count).forEach((t, i) => {
      this.projectiles.fireSpike(from, t, CONFIG.monster.spikeDamage * s.damageMult, (i - (count - 1) / 2) * CONFIG.monster.spikeSpreadRad);
    });
    this.particles.emit('spark', from, 4);
    m.consumeSpike(s.cooldownMult);
  }

  private onProjectileHit = (h: Hit): void => {
    if (h.kind === 'spike') {
      h.target?.applyDamage(h.damage);
      this.particles.emit('spark', h.point, 6);
      this.particles.emit('fire', h.point, 3, 0.5);
      return;
    }
    this.particles.explosion(h.point, 0.6);
    if (this.monster.alive && this.state === 'playing') {
      this.monster.hp = Math.max(0, this.monster.hp - h.damage);
      this.monster.flash();
      this.rig.addTrauma(0.05);
      if (this.monster.hp <= 0) this.startDying();
    }
  };

  private onTargetDestroyed = (target: Target, exp: number): void => {
    if (target.kind === 'tank') this.particles.explosion(target.position, 1);
    if (target.kind === 'jet') this.particles.explosion(target.position, 1.2);
    if (target.kind !== 'building') this.kills++;
    if (!this.monster.alive) return;
    this.progression.addExp(exp);
    this.events.emit('expGain', exp);
    if (this.progression.pendingLevels > 0 && this.state === 'playing') this.enterLevelUp();
  };

  dispose(): void {
    this.input.dispose();
    this.debug?.dispose();
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.pixel.dispose();
    this.events.removeAll();
  }
}
