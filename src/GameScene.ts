import * as THREE from 'three';
import { CONFIG } from './config';
import { GameEventEmitter, type GameState, type ThreatArrow } from './GameEvents';
import { Chevrons } from './systems/Chevrons';
import { edgeArrow } from './systems/edgeArrows';
import { Lighting } from './render/Lighting';
import { PixelRenderer } from './render/PixelRenderer';
import { createSky } from './render/Sky';
import { clampDelta, type Vec2 } from './util/math';
import { resolveHit, type DamageSource, type Target } from './combat';
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
import { EnemyRegistry } from './enemies/EnemyRegistry';
import { difficulty } from './enemies/spawnTable';
import type { WorldContext } from './enemies/types';
import { TankFleet } from './enemies/TankFleet';
import { JetSquadron } from './enemies/JetSquadron';
import { Blimps } from './enemies/Blimps';
import { SamSilos } from './enemies/SamSilos';
import { Artillery } from './enemies/Artillery';
import { GrappleTrucks } from './enemies/GrappleTrucks';
import { OrbitalLaser } from './enemies/OrbitalLaser';
import { clampToTethers } from './monster/tether';
import { mulberry32 } from './util/rng';
import { Progression, expToNext } from './systems/Progression';
import { healOnKill, regen } from './monster/vitals';
import { DebugOverlay } from './systems/DebugOverlay';
import { Abilities, type ActiveId } from './systems/abilities';
import { Shockwave } from './systems/Shockwave';
import { LevelUpMoment } from './systems/levelUpMoment';
import { LevelUpAura } from './systems/LevelUpAura';
import { ShieldFx } from './systems/ShieldFx';
import { shieldHitPoint } from './systems/shieldHit';
import { leapTarget } from './monster/leap';
import { footTargets, strikePlan } from './monster/strike';
import { mortarTargets, nearestWithin } from './systems/targeting';
import { Passives } from './systems/Passives';
import { AcidPools } from './systems/AcidPools';
import { BroodDrones } from './systems/BroodDrones';
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
  private enemies: EnemyRegistry;
  private ctx!: WorldContext;
  private rng = mulberry32(CONFIG.world.seed + 7);
  private progression = new Progression(mulberry32(CONFIG.world.seed + 13));
  private runTime = 0;
  private openingDone = false;
  private dyingT = 0;
  private hudT = 0;
  private stateBeforePause: GameState = 'playing';
  private debug: DebugOverlay | null = null;
  private chevrons: Chevrons;
  private abilities = new Abilities();
  private shockwave: Shockwave;
  private moment = new LevelUpMoment();
  private aura: LevelUpAura;
  private novaWave: Shockwave;
  private swatCd = 0;
  private shieldFx: ShieldFx;
  private passives: Passives;
  private acid: AcidPools;
  private brood: BroodDrones;

  constructor(private container: HTMLDivElement) {
    this.pixel = new PixelRenderer(container);
    this.lighting = new Lighting(this.scene);
    this.lighting.attachSky(createSky(this.scene));

    this.city = new City(this.scene, CONFIG.world.seed, this.onTargetDestroyed);
    this.monster = new Monster(this.scene);
    this.rig = new CameraRig(this.camera);
    this.markers = new Markers(this.scene);
    this.particles = new Particles(this.scene);
    this.chevrons = new Chevrons(this.scene);
    this.shockwave = new Shockwave(this.scene);
    this.aura = new LevelUpAura(this.scene);
    this.novaWave = new Shockwave(this.scene, CONFIG.palette.acid);
    this.shieldFx = new ShieldFx(this.scene);
    this.passives = new Passives(() => this.progression.ranks);
    this.acid = new AcidPools(this.scene);
    this.brood = new BroodDrones(this.scene);
    this.projectiles = new Projectiles(this.scene);
    this.projectiles.onTrail = (p) => this.particles.emit('smoke', p, 1, 0.2);
    this.projectiles.onHit = this.onProjectileHit;
    this.enemies = new EnemyRegistry(this.rng);
    this.enemies.add(new TankFleet(this.scene));
    this.enemies.add(new JetSquadron(this.scene));
    this.enemies.add(new Blimps(this.scene));
    this.enemies.add(new SamSilos(this.scene));
    this.enemies.add(new Artillery(this.scene));
    this.enemies.add(new GrappleTrucks(this.scene));
    this.enemies.add(new OrbitalLaser(this.scene));
    this.monster.constrain = (from, to) => clampToTethers(from, to, this.enemies.get<GrappleTrucks>('truck').activeTethers());
    this.ctx = this.buildContext();
    this.city.onCollapseStart = (pos, size) => {
      this.particles.ring('dust', pos, size, 14);
      this.particles.emit('debris', pos.clone().setY(30), 8);
      this.rig.addTrauma(0.12);
    };
    this.monster.onFootLand = (p) => {
      this.particles.ring('dust', p, 60, 7);
      this.rig.addTrauma(0.06);
      this.footCrush(p);
      const pool = this.passives.acidPool();
      if (pool && this.state === 'playing') this.acid.add(p, pool.radius, pool.life);
    };
    this.monster.onMeleeImpact = (p) => this.meleeImpact(p);
    this.monster.onLeapLand = (p) => this.leapLand(p);
    this.input = new Input(this.pixel.domElement, {
      tap: this.onTap,
      drag: (dx, dy) => this.rig.drag(dx, dy),
      wheel: (dy) => this.rig.zoom(dy),
      hover: this.onHover,
      key: (id) => {
        if (this.state !== 'playing') return false;
        this.pressAbility(id);
        return true;
      },
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
    if (id === 'dash' || id === 'roar') this.abilities.setRank(id, this.progression.ranks[id]);
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
    this.projectiles.clear();
    this.particles.clear();
    this.monster.reset();
    this.progression.reset();
    this.enemies.clear();
    this.rig.reset();
    this.order = null;
    this.markers.setTarget(null);
    this.kills = 0;
    this.runTime = 0;
    this.openingDone = false;
    this.abilities.reset();
    this.swatCd = 0;
    this.shieldFx.clear();
    this.moment.reset();
    this.aura.clear();
    this.monster.glow = 0;
    this.passives.reset();
    this.acid.clear();
    this.brood.clear();
    this.markers.setAim(null, 0);
    this.dyingT = 0;
    this.setState('playing');
    this.emitHud();
  }

  /** EXP bar fills, full heal, gold aura, slow motion; the cards follow when the moment ends. */
  private startLevelUpMoment(): void {
    if (this.moment.active) return;
    this.moment.start();
    this.aura.start();
    this.monster.hp = this.monster.maxHp;
    this.rig.addTrauma(0.35);
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

    private emitThreats(): void {
      const el = this.pixel.domElement;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const kinds = CONFIG.readability.threatKinds;
      const m = this.monster.position;
      const list = this.enemyTargets()
        .filter((t) => kinds.includes(t.kind))
        .sort((a, b) => a.position.distanceToSquared(m) - b.position.distanceToSquared(m))
        .slice(0, CONFIG.readability.maxArrows);
      const out: ThreatArrow[] = [];
      for (const t of list) {
        this.tmpV.copy(t.position).project(this.camera);
        const behind = this.tmpV.z > 1;
        const a = edgeArrow(this.tmpV.x, this.tmpV.y, behind, w, h, CONFIG.readability.arrowMarginPx);
        if (a) out.push({ ...a, kind: t.kind });
      }
      this.events.emit('threats', out);
    }

  private emitHud(): void {
    const m = this.monster;
    this.events.emit('hud', {
      hp: Math.ceil(m.hp),
      maxHp: m.maxHp,
      exp: this.moment.active ? 1 : this.progression.exp,
      expToNext: this.moment.active ? 1 : expToNext(this.progression.level),
      levelingUp: this.moment.active,
      level: this.progression.level,
      timeSec: Math.floor(this.runTime),
      tethered: this.enemies.get<GrappleTrucks>('truck').tethered(),
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
    if (next !== 'playing') {
      this.abilities.cancelAim();
      this.monster.crouch = false;
      this.markers.setAim(null, 0);
    }
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
    const realDt = clampDelta(raw);
    // World time runs in slow motion during the level-up moment; the aura and moment use real time.
    const dt = realDt * this.moment.timeScale();
    const frozen = this.state === 'levelup' || this.state === 'paused' || this.state === 'loading';

    if (!frozen) {
      this.elapsed += dt;
      if (this.state === 'playing') {
        this.runTime += dt;
        this.abilities.tick(dt);
        const fire = this.passives.update(dt);
        if (fire.storm > 0) this.spikeStorm(fire.storm);
        if (fire.brood > 0) this.brood.spawn(fire.brood, this.monster.model.stingerTip.getWorldPosition(new THREE.Vector3()));
        if (fire.nova > 0) this.venomNova();
        if (fire.mortar > 0) this.acidMortar(fire.mortar);
        if (fire.intercepts > 0) this.passives.spendIntercepts(this.spineShield(fire.intercepts));
        this.tailSwat(dt);
        const shields = this.passives.tryShields(this.threatImminent());
        if (shields.bubble || shields.reflect) this.rig.addTrauma(0.1);
        if (this.passives.reflectActive()) this.reflectProjectiles();
        if (this.monster.dashing) this.dashCrush();
        if (!this.openingDone && this.runTime >= CONFIG.opening.time) {
          this.openingDone = true;
          const c = { x: this.monster.position.x, z: this.monster.position.z };
          for (const p of ringOnRoads(c, CONFIG.opening.count, CONFIG.opening.radius, ROAD_ORIGIN, CONFIG.world.blockSize)) this.enemies.get<TankFleet>('tank').spawnAt(p.x, p.z, this.ctx);
        }
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
      this.enemies.update(dt, this.ctx, this.state === 'playing');
      this.projectiles.update(dt);
      this.city.update(dt, this.monster.position);
      this.monster.animate(dt, this.elapsed);
      this.particles.update(dt);
      this.shockwave.update(dt);
      this.novaWave.update(dt);
      this.shieldFx.update(dt, this.monster.position, this.passives.bubbleActive());
      if (this.moment.update(realDt) && this.state === 'playing' && this.progression.pendingLevels > 0) this.enterLevelUp();
      const dm = this.progression.stats.damageMult;
      this.acid.update(dt, this.enemyTargets(), dm);
      this.brood.update(dt, this.enemyTargets(), dm);
      this.markers.update(dt);

      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 1 / CONFIG.hudHz;
        this.emitHud();
        this.emitThreats();
        this.events.emit('abilities', this.abilities.view());
      }
    }

    // Purely visual: the aura keeps playing behind the level-up cards.
    if (this.state === 'playing' || this.state === 'levelup') {
      this.aura.update(realDt, this.monster.position, this.particles);
      this.monster.glow = this.aura.glow();
      if (frozen) this.monster.animate(0, this.elapsed);
    }
    this.rig.update(frozen ? 0 : dt, this.monster.position);
    this.chevrons.update(this.enemyTargets(), this.camera, this.elapsed);
    this.lighting.follow(this.monster.position);
    this.lighting.followCamera(this.camera);
    this.pixel.render(this.scene, this.camera);
    this.debug?.update(raw, this.pixel.renderer.info);
  };


  pressAbility(id: ActiveId): void {
    if (this.state !== 'playing' || !this.monster.alive) return;
    if (id === 'roar') {
      if (this.abilities.trigger('roar')) this.roar();
      return;
    }
    const aiming = this.abilities.toggleAim(id);
    this.monster.crouch = aiming === 'leap';
    if (!aiming) this.markers.setAim(null, 0);
  }

  /** Aim-ring placement and radius for the ability being aimed. */
  private aimPoint(ground: THREE.Vector3): { to: Vec2; radius: number } {
    const m = this.monster.position;
    const aim = this.abilities.aiming === 'dash' ? CONFIG.abilities.dash : CONFIG.abilities.leap;
    const to = leapTarget({ x: m.x, z: m.z }, { x: ground.x, z: ground.z }, aim.range);
    return { to, radius: this.abilities.aiming === 'dash' ? CONFIG.abilities.dash.crushRadius : CONFIG.abilities.leap.landRadius };
  }

  private dashTo(ground: THREE.Vector3): void {
    const m = this.monster;
    const { to } = this.aimPoint(ground);
    if (!this.abilities.trigger('dash')) return;
    this.trucks().snapAll();
    m.crouch = false;
    m.startDash(to);
    this.order = null;
    this.markers.setTarget(null);
    this.markers.setAim(null, 0);
    this.rig.addTrauma(0.3);
  }

  /** Dash flattens everything on the ground around the monster as it charges. */
  private dashCrush(): void {
    const p = this.monster.position;
    const r = CONFIG.abilities.dash.crushRadius;
    this.city.forEachStandingInRadius({ x: p.x, z: p.z }, r, (t) => t.applyDamage(1e9));
    for (const t of footTargets({ x: p.x, z: p.z }, r, this.enemyTargets())) t.applyDamage(1e9);
    this.particles.emit('dust', p.clone().setY(10), 2, 0.8);
  }

    private trucks(): GrappleTrucks {
      return this.enemies.get<GrappleTrucks>('truck');
    }

    private leapTo(ground: THREE.Vector3): void {
      const m = this.monster;
      const to = leapTarget({ x: m.position.x, z: m.position.z }, { x: ground.x, z: ground.z }, CONFIG.abilities.leap.range);
      if (!this.abilities.trigger('leap')) return;
      this.trucks().snapAll();
      m.crouch = false;
      m.startLeap(to);
      this.order = null;
      this.markers.setTarget(null);
      this.markers.setAim(null, 0);
      this.particles.ring('dust', m.position, 200, 12);
    }

    private leapLand(p: THREE.Vector3): void {
      const L = CONFIG.abilities.leap;
      const dmg = L.damage * this.progression.stats.damageMult;
      this.city.forEachStandingInRadius({ x: p.x, z: p.z }, L.landRadius, (t) => t.applyDamage(dmg * 3));
      for (const t of this.enemyTargets()) {
        if (!t.airborne && Math.hypot(t.position.x - p.x, t.position.z - p.z) <= L.landRadius + t.radius) t.applyDamage(dmg);
      }
      this.particles.ring('dust', p, L.landRadius, 26);
      this.particles.emit('debris', p.clone().setY(20), 16, 1.6);
      this.rig.addTrauma(0.55);
    }

    private roar(): void {
      const R = CONFIG.abilities.roar;
      const m = this.monster;
      const p = m.position;
      m.startRoar();
      this.order = null;
      this.trucks().snapAll();
      this.shockwave.start(p, R.radius);
      const dmg = R.damage * this.progression.stats.damageMult;
      this.city.forEachStandingInRadius({ x: p.x, z: p.z }, R.radius, (t) => t.applyDamage(R.buildingDamage));
      for (const t of [...this.enemyTargets()]) {
        if (Math.hypot(t.position.x - p.x, t.position.z - p.z) > R.radius + t.radius) continue;
        t.applyDamage(t.airborne ? 1e9 : dmg);
      }
      this.particles.ring('dust', p, R.radius * 0.5, 30);
      this.rig.addTrauma(0.7);
    }

    /** Spike Storm: one homing spike at each of the n nearest enemies in range (repeating if fewer). */
    private spikeStorm(n: number): void {
      const m = this.monster;
      const inRange = this.enemyTargets()
        .filter((t) => t.position.distanceTo(m.position) <= CONFIG.monster.spikeRange)
        .sort((a, b) => a.position.distanceToSquared(m.position) - b.position.distanceToSquared(m.position));
      if (inRange.length === 0) return;
      const from = m.model.stingerTip.getWorldPosition(new THREE.Vector3());
      const dmg = CONFIG.monster.spikeDamage * this.progression.stats.damageMult;
      for (let i = 0; i < n; i++) {
        this.projectiles.fireSpike(from, inRange[i % inRange.length]!, dmg, (i - (n - 1) / 2) * 0.25);
      }
      this.particles.emit('spark', from, 10, 1.5);
    }

  /** Head-height point the tail swats around and spines fire from (world space). */
  private bodyPoint(height: number): THREE.Vector3 {
    return this.monster.position.clone().setY(this.monster.position.y + height * CONFIG.monster.scale);
  }

  /** Base kit: the tail lashes at the nearest flyers near the head on a rank-based cooldown. */
  private tailSwat(dt: number): void {
    this.swatCd = Math.max(0, this.swatCd - dt);
    if (this.swatCd > 0 || this.monster.airborne || this.monster.swatting) return;
    const sw = this.passives.swat();
    const head = this.bodyPoint(CONFIG.passives.swat.headHeight);
    const flyers = this.enemyTargets().filter((t) => t.airborne && t.isAlive());
    const hits = nearestWithin(head, sw.range, flyers, sw.targets, (t) => t.position);
    if (hits.length === 0) return;
    this.swatCd = sw.cooldown;
    const dmg = sw.damage * this.progression.stats.damageMult;
    // Damage lands when the tail tip arrives at the first target (it follows that target as it moves).
    this.monster.onSwatImpact = () => {
      for (const t of hits) {
        if (!t.isAlive()) continue;
        t.applyDamage(dmg);
        this.particles.emit('spark', t.position, 12, 1.3);
        this.particles.emit('fire', t.position, 4, 0.6);
      }
      this.rig.addTrauma(0.18);
    };
    this.monster.startSwat(hits[0]!.position);
  }

  /** Something is about to hit: shells/rockets/missiles or blimps nearby, a laser locking on, or a strike circle underfoot. */
  private threatImminent(): boolean {
    const center = this.bodyPoint(300);
    const range = CONFIG.passives.threatRange;
    const near = (p: THREE.Vector3) => p.distanceTo(center) <= range;
    if (this.projectiles.incoming().some((s) => near(s.pos))) return true;
    if (this.enemyTargets().some((t) => (t.kind === 'missile' || t.kind === 'blimp') && near(t.position))) return true;
    const laser = this.enemies.get<OrbitalLaser>('laser').current();
    const m = this.monster.position;
    if ((laser.phase === 'locked' || laser.phase === 'firing') && Math.hypot(laser.x - m.x, laser.z - m.z) <= CONFIG.laser.radius * 1.5) return true;
    return this.enemies.get<Artillery>('artillery').strikeNear({ x: m.x, z: m.z });
  }

  /** Reflect Shield: projectiles reaching the dome bounce back as spikes at the nearest enemy. */
  private reflectProjectiles(): void {
    const R = CONFIG.passives.reflect;
    const center = this.bodyPoint(300);
    const dmg = R.damage * this.progression.stats.damageMult;
    const bounce = (from: THREE.Vector3) => {
      // The shield is invisible except for a patch flashing where the shot struck it.
      const at = shieldHitPoint(center, R.radius, from, new THREE.Vector3());
      this.shieldFx.reflectHit(at, at.clone().sub(center));
      const target = nearestInRange({ x: from.x, z: from.z }, this.enemyTargets(), CONFIG.monster.spikeRange * 1.5);
      if (target) this.projectiles.fireSpike(at.clone(), target, dmg, 0);
      this.particles.emit('spark', at, 8, 0.6);
    };
    for (const s of [...this.projectiles.incoming()]) {
      if (s.pos.distanceTo(center) > R.radius) continue;
      const at = s.pos.clone();
      if (this.projectiles.intercept(s)) bounce(at);
    }
    for (const t of this.enemyTargets()) {
      if (t.kind !== 'missile' || !t.isAlive() || t.position.distanceTo(center) > R.radius) continue;
      const at = t.position.clone();
      t.applyDamage(1e9);
      bounce(at);
    }
  }

  /** Spine Shield: shoot down up to `budget` incoming shells, rockets, and SAM missiles. Returns shots used. */
  private spineShield(budget: number): number {
    const center = this.bodyPoint(300);
    const r = this.passives.spineRadius();
    type Threat = { pos: THREE.Vector3; kill(): void };
    const threats: Threat[] = [
      ...this.projectiles.incoming().map((s) => ({ pos: s.pos, kill: () => this.projectiles.intercept(s) })),
      ...this.enemyTargets()
        .filter((t) => t.kind === 'missile' && t.isAlive())
        .map((t) => ({ pos: t.position, kill: () => t.applyDamage(1e9) })),
    ];
    const picks = nearestWithin(center, r, threats, budget, (t) => t.pos);
    for (const t of picks) {
      this.particles.emit('spark', t.pos, 8, 0.6);
      this.particles.emit('smoke', t.pos, 1, 0.3);
      t.kill();
    }
    if (picks.length > 0) this.particles.emit('spark', center, 3, 0.4);
    return picks.length;
  }

  /** Venom Nova: an acid pulse damaging every ground enemy and building in radius. */
  private venomNova(): void {
    const { radius, damage } = this.passives.nova();
    const p = this.monster.position;
    const dmg = damage * this.progression.stats.damageMult;
    this.novaWave.start(p, radius);
    this.city.forEachStandingInRadius({ x: p.x, z: p.z }, radius, (t) => t.applyDamage(dmg));
    for (const t of footTargets({ x: p.x, z: p.z }, radius, this.enemyTargets())) t.applyDamage(dmg);
    this.particles.ring('acid', p, radius * 0.6, 24);
    this.rig.addTrauma(0.25);
  }

  /** Acid Mortar: lob globs at priority ground threats (artillery, SAMs, trucks, then tanks). */
  private acidMortar(globs: number): void {
    const M = CONFIG.passives.mortar;
    const targets = mortarTargets(this.monster.position, M.range, this.enemyTargets(), globs);
    if (targets.length === 0) return;
    const from = this.monster.model.stingerTip.getWorldPosition(new THREE.Vector3());
    const dmg = M.damage * this.progression.stats.damageMult;
    targets.forEach((t) => this.projectiles.fireGlob(from, t.position.clone().setY(0), dmg));
    this.particles.emit('acid', from, 6, 0.6);
  }

  /** Live targetable enemies (cached per frame by the registry). */
  enemyTargets(): Target[] {
    return this.enemies.targets();
  }

  /** One mutable context object shared by all enemy systems; getters read live game state. */
  private buildContext(): WorldContext {
    const self = this;
    return {
      get monster() {
        return { position: self.monster.position, alive: self.monster.alive, airborne: self.monster.airborne };
      },
      get difficulty() {
        return difficulty(self.runTime);
      },
      get minutes() {
        return self.runTime / 60;
      },
      rng: this.rng,
      particles: this.particles,
      get tetherDurationMult() {
        return self.passiveTetherMult();
      },
      get thrashDamage() {
        return self.passiveThrashDamage();
      },
      damageMonster: (amount, source) => this.damageMonster(amount, source),
      damageBuildings: (p, r, amount) => this.city.forEachStandingInRadius(p, r, (t) => t.applyDamage(amount)),
      fireShell: (from, to, damage) => {
        this.projectiles.fireShell(from, to, damage);
        this.particles.emit('fire', from, 2, 0.3);
      },
      fireRocket: (from, to, damage) => {
        this.projectiles.fireRocket(from, to, damage);
        this.particles.emit('fire', from, 2, 0.3);
      },
      shake: (a) => this.rig.addTrauma(a),
      onDestroyed: this.onTargetDestroyed,
    };
  }

  /** Thrash: tether duration multiplier and snap damage. */
  private passiveTetherMult(): number {
    return this.passives.tetherMult();
  }
  private passiveThrashDamage(): number {
    return this.passives.thrashDamage();
  }
  /** Chitin Deflection chance. */
  private deflectChance(): number {
    return this.passives.deflectChance();
  }

  /** The only way the monster takes damage. */
  damageMonster(amount: number, source: DamageSource): void {
    const m = this.monster;
    if (!m.alive || this.state !== 'playing') return;
    const r = resolveHit(amount, source, { dmgMult: difficulty(this.runTime).dmgMult, deflectChance: this.deflectChance(), airborne: m.airborne, invulnerable: this.passives.bubbleActive() }, Math.random());
    if (r.deflected) {
      this.particles.emit('spark', m.position.clone().setY(300 * CONFIG.monster.scale), 8);
      return;
    }
    if (r.damage <= 0) return;
    m.hp = Math.max(0, m.hp - r.damage);
    m.flash();
    this.rig.addTrauma(Math.min(0.4, 0.03 + r.damage * 0.004));
    if (m.hp <= 0) this.startDying();
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
    if (this.abilities.aiming) {
      this.setRay(x, y);
      const g = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
      if (g) {
        if (this.abilities.aiming === 'dash') this.dashTo(g.clone());
        else this.leapTo(g.clone());
      }
      return;
    }
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
    if (this.abilities.aiming && this.state === 'playing') {
      this.setRay(x, y);
      const g = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
      if (g) {
        const { to, radius } = this.aimPoint(g);
        this.markers.setAim(new THREE.Vector3(to.x, 0, to.z), radius);
      }
      return;
    }
    const t = this.state === 'playing' ? this.pickTarget(x, y) : null;
    this.markers.setHover(t);
    this.container.classList.toggle('can-target', t !== null);
  };

  private toBrain(t: Target): BrainTarget {
    return { x: t.position.x, z: t.position.z, radius: t.radius, airborne: t.airborne, alive: t.isAlive() };
  }

  /** A landed foot damages buildings and ground enemies under it. */
  private footCrush(p: THREE.Vector3): void {
    if (this.state !== 'playing' || !this.monster.alive) return;
    const r = CONFIG.monster.footRadius;
    const dmg = CONFIG.monster.footDamage * this.progression.stats.damageMult;
    this.city.forEachStandingInRadius({ x: p.x, z: p.z }, r, (t) => t.applyDamage(dmg));
    for (const t of footTargets({ x: p.x, z: p.z }, r, this.enemyTargets())) t.applyDamage(dmg);
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
    if (!m.busy) {
      const auto = nearestInRange(pos, this.enemyTargets(), CONFIG.monster.spikeRange);
      const autoMelee = nearestInRange(pos, this.enemyTargets().filter((t) => !t.airborne), CONFIG.monster.meleeRange);
      const order: BrainOrder =
        this.order?.kind === 'attack' ? { kind: 'attack', target: this.toBrain(this.order.target) } : this.order;
      const d = decide({
        pos,
        order,
        auto: auto ? this.toBrain(auto) : null,
        autoMelee: autoMelee ? this.toBrain(autoMelee) : null,
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
      if (d.attack === 'melee' && d.meleeAt) {
        const plan = strikePlan(pos, m.yaw, d.meleeAt, CONFIG.monster.meleeRange);
        m.startMelee(s.cooldownMult, plan.leg, plan.point);
      }
      if (d.attack === 'ranged') this.fireSpikes(d.attackOn === 'order' && this.order?.kind === 'attack' ? this.order.target : auto);
    }
    m.tick(dt);

    if (!m.airborne) this.city.forEachStandingInRadius(pos, CONFIG.monster.bodyRadius, (t) => t.applyDamage(CONFIG.monster.contactDps * dt));
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
    if (h.kind === 'glob') {
      const r = this.passives.mortarSplash();
      this.city.forEachStandingInRadius({ x: h.point.x, z: h.point.z }, r, (t) => t.applyDamage(h.damage));
      for (const t of footTargets({ x: h.point.x, z: h.point.z }, r, this.enemyTargets())) t.applyDamage(h.damage);
      this.particles.ring('acid', h.point, r, 14);
      this.particles.emit('acid', h.point, 10, 1);
      return;
    }
    if (h.kind === 'spike') {
      h.target?.applyDamage(h.damage);
      this.particles.emit('spark', h.point, 6);
      this.particles.emit('fire', h.point, 3, 0.5);
      return;
    }
    this.particles.explosion(h.point, 0.6);
    this.damageMonster(h.damage, h.kind === 'shell' ? 'shell' : 'rocket');
  };

  private onTargetDestroyed = (target: Target, exp: number): void => {
    if (target.kind !== 'building') this.particles.explosion(target.position, target.airborne ? 1.2 : 1);
    if (target.kind !== 'building') {
      this.kills++;
      this.monster.hp = healOnKill(this.monster.hp, this.monster.maxHp, this.passives.frenzyHeal(), this.monster.alive);
    }
    if (!this.monster.alive) return;
    this.progression.addExp(exp);
    this.events.emit('expGain', exp);
    if (this.progression.pendingLevels > 0 && this.state === 'playing') this.startLevelUpMoment();
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
