import * as THREE from 'three';
import { CONFIG } from './config';
import { GameEventEmitter, type GameState, type ThreatArrow } from './GameEvents';
import { Chevrons } from './systems/Chevrons';
import { edgeArrow } from './systems/edgeArrows';
import { Lighting } from './render/Lighting';
import { PixelRenderer } from './render/PixelRenderer';
import { createSky } from './render/Sky';
import { clampDelta, yawTo, type Vec2 } from './util/math';
import { resolveHit, type DamageSource, type Target } from './combat';
import { City, CRATER_RADIUS } from './world/City';
import { IntroCinematic } from './intro/IntroCinematic';
import { ringOnRoads } from './world/roads';
import { ROAD_ORIGIN } from './world/chunks';
import { Monster } from './monster/Monster';
import { CameraRig } from './systems/CameraRig';
import { Input } from './systems/Input';
import { Markers } from './systems/Markers';
import { pickEnemy } from './systems/tap';
import { Particles } from './systems/Particles';
import { BreathBeam } from './systems/BreathBeam';
import { arcTargets, inArc, linePoints, lineTargets } from './systems/sweep';
import { canAim } from './monsters/kaiju/neck';
import { tailSide, tailSweepTarget } from './monsters/kaiju/tailSweep';
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
import { LaserTrucks } from './enemies/LaserTrucks';
import { OrbitalLaser } from './enemies/OrbitalLaser';
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
import { dashTarget, leapTarget } from './monster/leap';
import { footTargets, strikePlan } from './monster/strike';
import { mortarTargets, nearestWithin } from './systems/targeting';
import { Passives } from './systems/Passives';
import { AcidPools } from './systems/AcidPools';
import { BroodDrones } from './systems/BroodDrones';
import { decide, nearestInRange, type BrainOrder, type BrainTarget } from './monster/brain';
import { assignStrikes } from './monsters/kraken/strikes';
import type { ArmStrike } from './monsters/kraken/TentacleArms';
import { INSECT } from './monsters/insect/kind';
import { backhandYaw, bearingTo, fistKind } from './monsters/golem/fist';
import { auraOn, coolHeat, coreDamageMult, heatAfterHit } from './monsters/golem/heat';
import { KINDS, ROSTER_ORDER, isMonsterId, rosterEntries } from './monsters/roster';
import { loadPick, savePick, type PickStore } from './monsters/pick';
import type { MonsterKind } from './monsters/types';
import { flowNext } from './menuFlow';
import { frameHeight, selectPose, titlePose } from './systems/menuCamera';

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

  /** The current monster's stats. */
  private get ms() {
    return this.monster.kind.stats;
  }
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
  /** Pending levels granted by the Konami cheat; each one's offer lists every choice. */
  private cheatLevels = 0;
  private chevrons: Chevrons;
  private abilities = new Abilities();
  private shockwave: Shockwave;
  private moment = new LevelUpMoment();
  private aura: LevelUpAura;
  private novaWave: Shockwave;
  private breath: BreathBeam;
  /** Set once the player browses the carousel, so a late saved pick cannot move it. */
  private browsed = false;
  private jaws = new THREE.Vector3();
  private swatCd = 0;
  private tailCd = 0;
  /** Molten Core heat 0..1 (Golem); always 0 when the passive isn't taken. */
  private heat = 0;
  private shieldFx: ShieldFx;
  private passives: Passives;
  private acid: AcidPools;
  private brood: BroodDrones;
  private intro: IntroCinematic;
  private selIndex = 0;
  private menuT = 0;
  private menuPose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

  constructor(private container: HTMLDivElement, private store: PickStore | null = null) {
    this.pixel = new PixelRenderer(container);
    this.lighting = new Lighting(this.scene);
    this.lighting.attachSky(createSky(this.scene));

    this.city = new City(this.scene, CONFIG.world.seed, this.onTargetDestroyed);
    this.monster = new Monster(this.scene, INSECT);
    this.progression.setPool(this.monster.kind);
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
    this.breath = new BreathBeam(this.scene);
    this.projectiles.onTrail = (p) => this.particles.emit('smoke', p, 1, 0.2);
    this.projectiles.onHit = this.onProjectileHit;
    this.enemies = new EnemyRegistry(this.rng);
    this.enemies.add(new TankFleet(this.scene));
    this.enemies.add(new JetSquadron(this.scene));
    this.enemies.add(new Blimps(this.scene));
    this.enemies.add(new SamSilos(this.scene));
    this.enemies.add(new Artillery(this.scene));
    this.enemies.add(new LaserTrucks(this.scene));
    this.enemies.add(new OrbitalLaser(this.scene));
    this.ctx = this.buildContext();
    this.intro = new IntroCinematic({ scene: this.scene, camera: this.camera, overlay: container, monster: this.monster, city: this.city, particles: this.particles });
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
      const grip = this.passives.grip();
      if (grip && this.state === 'playing') {
        const victim = nearestInRange({ x: p.x, z: p.z }, this.enemyTargets().filter((t) => !t.airborne), grip.radius);
        if (victim) {
          victim.applyDamage(grip.damage * this.dmgMult());
          this.particles.emit('ink', victim.position, 8, 0.8);
        }
      }
    };
    this.monster.onMeleeImpact = (p) => this.meleeImpact(p);
    this.monster.onLeapLand = (p) => this.leapLand(p);
    this.input = new Input(this.pixel.domElement, {
      tap: this.onTap,
      drag: (dx, dy) => this.rig.drag(dx, dy),
      wheel: (dy) => this.rig.zoom(dy),
      hover: this.onHover,
      menuKey: (k) => {
        if (this.state !== 'select') return false;
        if (k === 'confirm') this.playSelected();
        else this.selectStep(k === 'left' ? -1 : 1);
        return true;
      },
      skipKey: () => {
        if (this.state === 'title') {
          this.startFromTitle();
          return true;
        }
        if (this.state !== 'intro') return false;
        this.skipIntro();
        return true;
      },
      key: (id) => {
        if (this.state !== 'playing') return false;
        this.pressAbility(id);
        return true;
      },
      konami: this.cheatLevelUp,
    });

    this.lighting.follow(new THREE.Vector3());
    if (new URLSearchParams(location.search).has('debug')) this.debug = new DebugOverlay(this.container);

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(container);
    this.clock.start();
    this.update();
    this.enterTitle();
    // The saved pick arrives asynchronously; it only picks the carousel's starting monster.
    void loadPick(this.store).then((id) => {
      if (this.browsed) return;
      this.selIndex = ROSTER_ORDER.indexOf(id);
      if (this.state === 'select') this.showSelection();
    });
  }

  getState(): GameState {
    return this.state;
  }

  /** Called by the React level-up cards. */
  chooseUpgrade(id: string, seq: number): void {
    if (this.state !== 'levelup' || !this.progression.choose(id, seq)) return;
    if (this.cheatLevels > 0) this.cheatLevels--;
    if (id === 'dash' || id === 'roar') this.abilities.setRank(id, this.progression.ranks[id]);
    const s = this.progression.stats;
    const m = this.monster;
    const newMax = Math.round(this.ms.maxHp * s.maxHpMult);
    if (id === 'vitality') m.hp = Math.min(newMax, m.hp + newMax * 0.3);
    m.maxHp = newMax;
    this.emitHud();
    if (this.progression.pendingLevels > 0) this.emitOffer();
    else this.setState('playing');
  }

  pause(): void {
    if (this.state === 'paused' || this.state === 'gameover' || this.state === 'title' || this.state === 'select') return;
    this.stateBeforePause = this.state;
    this.setState('paused');
  }

  resume(): void {
    if (this.state === 'paused') this.setState(this.stateBeforePause);
  }

  private resetRun(): void {
    this.city.reset();
    this.projectiles.clear();
    this.breath.clear();
    this.monster.body.arms?.clear();
    this.particles.clear();
    this.monster.reset();
    this.progression.reset();
    this.cheatLevels = 0;
    this.enemies.clear();
    this.rig.reset();
    this.order = null;
    this.markers.setTarget(null);
    this.kills = 0;
    this.runTime = 0;
    this.openingDone = false;
    this.abilities.reset();
    this.swatCd = 0;
    this.tailCd = 0;
    this.heat = 0;
    this.monster.heat = 0;
    this.shieldFx.clear();
    this.moment.reset();
    this.aura.clear();
    this.monster.glow = 0;
    this.passives.reset();
    this.acid.clear();
    this.brood.clear();
    this.markers.setAim(null, 0);
    this.dyingT = 0;
  }

  /** Game over → Play Again: same monster, fresh world, the intro replays. */
  restart(): void {
    if (flowNext(this.state, 'playAgain') === null) return;
    this.resetRun();
    this.startIntro();
    this.emitHud();
  }

  /** Game over → Change Monster: fresh world, back to the select screen. */
  changeMonster(): void {
    if (flowNext(this.state, 'changeMonster') === null) return;
    this.resetRun();
    this.enterSelect();
  }

  startFromTitle(): void {
    if (flowNext(this.state, 'start') === null) return;
    this.enterSelect();
  }

  /** Browse the carousel (wraps around). */
  selectStep(delta: number): void {
    if (this.state !== 'select') return;
    this.browsed = true;
    const n = ROSTER_ORDER.length;
    this.selIndex = (((this.selIndex + delta) % n) + n) % n;
    this.showSelection();
  }

  /** PLAY: only for a playable monster; the city is rebuilt so the intro crashes into it. */
  playSelected(): void {
    if (flowNext(this.state, 'play') === null) return;
    if (!rosterEntries()[this.selIndex]!.available) return;
    this.resetRun();
    this.startIntro();
    this.emitHud();
  }

  private enterTitle(): void {
    this.monster.visible = false;
    this.menuT = 0;
    this.setState('title');
  }

  private enterSelect(): void {
    this.menuT = 0;
    this.setState('select');
    this.showSelection();
  }

  /** Show the carousel's current entry: the monster in its crater (or an empty crater for coming-soon). */
  private showSelection(): void {
    const entries = rosterEntries();
    const e = entries[this.selIndex]!;
    if (isMonsterId(e.id)) {
      this.applyKind(KINDS[e.id]);
      this.monster.visible = true;
      void savePick(this.store, e.id);
    } else {
      this.monster.visible = false;
    }
    // Diorama crater: the same instant blast a skipped intro applies (no EXP, no stat).
    this.city.blast({ x: 0, z: 0 }, CRATER_RADIUS, true, CRATER_RADIUS * CONFIG.intro.impact.outer);
    this.events.emit('roster', { entries, index: this.selIndex });
  }

  /** Become `kind`: body, stats, and level-up pool. */
  private applyKind(kind: MonsterKind): void {
    this.monster.setKind(kind);
    this.progression.setPool(kind);
    this.projectiles.setTheme(kind.fx.spike, kind.fx.glob);
    this.acid.setColor(kind.fx.pool);
    this.novaWave.setColor(kind.fx.nova);
    this.breath.clear();
  }

  /** All of the monster's damage: upgrades × the creature's own multiplier × Meltdown × Molten Core heat. */
  private dmgMult(): number {
    const m = this.monster;
    const core = this.passives.core();
    const heat = core ? coreDamageMult(this.heat, core.bonus) : 1;
    return this.progression.stats.damageMult * m.kind.stats.damageMult * this.passives.meltdown(m.hp / m.maxHp).damage * heat;
  }

  /** Ranged recharge: upgrades × Meltdown. */
  private rangedCdMult(): number {
    const m = this.monster;
    return this.progression.stats.cooldownMult * this.passives.meltdown(m.hp / m.maxHp).cooldown;
  }

  private startIntro(): void {
    this.intro.start();
    this.setState('intro');
  }

  /** Skip the rest of the intro (tap, click, or key). Public for scripted checks and the M4 menus. */
  skipIntro(): void {
    if (this.state !== 'intro') return;
    this.intro.skip();
    this.endIntro();
  }

  /** The intro drove the camera; hand it back exactly on the default gameplay pose (no leftover trauma or drag). */
  private endIntro(): void {
    this.rig.reset();
    this.setState('playing');
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
    const all = this.cheatLevels > 0;
    const offers = this.progression.offer(all);
    this.events.emit('levelUpOffer', { seq: this.progression.offerSeq, offers, all });
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
    });
  }

  private startDying(): void {
    this.breath.clear();
    this.monster.body.arms?.clear();
    this.monster.charge = 0;
    this.monster.lookAt = null;
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
    this.intro.space.setAspect(w / h);
  };

  private update = () => {
    this.animationFrameId = requestAnimationFrame(this.update);
    const raw = this.clock.getDelta();
    const realDt = clampDelta(raw);
    // World time runs in slow motion during the level-up moment; the aura and moment use real time.
    const dt = realDt * this.moment.timeScale();
    const frozen = this.state === 'levelup' || this.state === 'paused' || this.state === 'loading';

    if (!frozen) {
      if (this.state === 'intro' && this.intro.update(realDt)) this.endIntro();
      this.elapsed += dt;
      if (this.state === 'playing') {
        this.runTime += dt;
        this.abilities.tick(dt);
        const fire = this.passives.update(dt);
        if (fire.storm > 0) this.spikeStorm(fire.storm);
        if (fire.brood > 0) this.brood.spawn(fire.brood, this.monster.launchOrigin(new THREE.Vector3()));
        if (fire.nova > 0) this.venomNova();
        if (fire.mortar > 0) this.acidMortar(fire.mortar);
        if (fire.intercepts > 0) this.passives.spendIntercepts(this.spineShield(fire.intercepts));
        this.tailSwat(dt);
        this.tailSweep(dt);
        this.updateCore(dt);
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
        this.tentacleSlams();
        this.monster.body.arms?.update(dt, CONFIG.kraken.arms.spinTime, this.onArmImpact);
        // The head turns to the breath's aim; the breath fires once the head is on target.
        this.monster.lookAt = this.breath.busy ? this.breath.aimPoint : null;
        const headOnTarget = this.monster.aimError() < CONFIG.kaiju.neck.aimTolerance;
        this.breath.update(dt, this.monster.rangedOrigin(this.jaws), this.monster.position, this.ms.rangedRange, headOnTarget, this.onBreathFire);
        const melting = this.passives.meltdown(this.monster.hp / this.monster.maxHp).active;
        this.monster.charge = Math.max(this.breath.charge, melting ? 0.5 : 0);
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
      const dm = this.dmgMult();
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
    const shown = this.state === 'paused' ? this.stateBeforePause : this.state;
    if (shown === 'title' || shown === 'select') {
      if (!frozen) this.menuT += realDt;
      if (shown === 'title') titlePose(this.menuT, this.menuPose);
      else selectPose(this.menuT, frameHeight(this.ms.size), this.camera.aspect, this.menuPose);
      this.camera.position.copy(this.menuPose.pos);
      this.camera.lookAt(this.menuPose.look);
    } else if (!this.intro.active) {
      // While the intro runs (even paused) it owns the camera.
      this.rig.update(frozen ? 0 : dt, this.monster.position);
    }
    this.chevrons.update(this.enemyTargets(), this.camera, this.elapsed);
    this.lighting.follow(this.monster.position);
    this.lighting.followCamera(this.camera);
    if (this.intro.inSpace) this.pixel.render(this.intro.space.scene, this.intro.space.camera);
    else this.pixel.render(this.scene, this.camera);
    this.debug?.update(raw, this.pixel.renderer.info);
  };


  pressAbility(id: ActiveId): void {
    if (this.state !== 'playing' || !this.monster.alive) return;
    if (id === 'roar') {
      if (this.abilities.trigger('roar')) this.roar();
      return;
    }
    if (id === 'dash') {
      this.dash();
      return;
    }
    const aiming = this.abilities.toggleAim(id);
    this.monster.crouch = aiming === 'leap';
    if (!aiming) this.markers.setAim(null, 0);
  }

  /** Leap aim-ring placement: the ground point clamped to Leap range. */
  private aimPoint(ground: THREE.Vector3): { to: Vec2; radius: number } {
    const m = this.monster.position;
    const to = leapTarget({ x: m.x, z: m.z }, { x: ground.x, z: ground.z }, CONFIG.abilities.leap.range);
    return { to, radius: CONFIG.abilities.leap.landRadius };
  }

  /** Dash: charge the full range straight ahead, the way the monster is facing. */
  private dash(): void {
    const m = this.monster;
    if (m.busy || !this.abilities.trigger('dash')) return;
    const to = dashTarget({ x: m.position.x, z: m.position.z }, m.yaw, CONFIG.abilities.dash.range);
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

    private leapTo(ground: THREE.Vector3): void {
      const m = this.monster;
      const to = leapTarget({ x: m.position.x, z: m.position.z }, { x: ground.x, z: ground.z }, CONFIG.abilities.leap.range);
      if (!this.abilities.trigger('leap')) return;
            m.crouch = false;
      m.startLeap(to);
      this.order = null;
      this.markers.setTarget(null);
      this.markers.setAim(null, 0);
      this.particles.ring('dust', m.position, 200, 12);
    }

    private leapLand(p: THREE.Vector3): void {
      const L = CONFIG.abilities.leap;
      const dmg = L.damage * this.dmgMult();
      this.city.forEachStandingInRadius({ x: p.x, z: p.z }, L.landRadius, (t) => t.applyDamage(dmg * 3));
      for (const t of this.enemyTargets()) {
        if (!t.airborne && Math.hypot(t.position.x - p.x, t.position.z - p.z) <= L.landRadius + t.radius) t.applyDamage(dmg);
      }
      this.particles.ring('dust', p, L.landRadius, 26);
      this.particles.emit('debris', p.clone().setY(20), 16, 1.6);
      this.rig.addTrauma(0.55);
      if (this.monster.kind.id === 'golem') this.particles.ring('magma', p, 220, 18);
    }

    private roar(): void {
      const R = CONFIG.abilities.roar;
      const m = this.monster;
      const p = m.position;
      m.startRoar();
      this.order = null;
            this.shockwave.start(p, R.radius);
      const dmg = R.damage * this.dmgMult();
      this.city.forEachStandingInRadius({ x: p.x, z: p.z }, R.radius, (t) => t.applyDamage(R.buildingDamage));
      for (const t of [...this.enemyTargets()]) {
        if (Math.hypot(t.position.x - p.x, t.position.z - p.z) > R.radius + t.radius) continue;
        t.applyDamage(t.airborne ? 1e9 : dmg);
      }
      this.particles.ring('dust', p, R.radius * 0.5, 30);
      this.rig.addTrauma(0.7);
      if (this.monster.kind.id === 'golem') for (let i = 0; i < 3; i++) this.particles.emit('magma', this.monster.launchOrigin(this.tmpV), 8, 1.2);
    }

    /** Spike Storm: one homing spike at each of the n nearest enemies in range (repeating if fewer). */
    private spikeStorm(n: number): void {
      const m = this.monster;
      const inRange = this.enemyTargets()
        .filter((t) => t.position.distanceTo(m.position) <= this.ms.rangedRange)
        .sort((a, b) => a.position.distanceToSquared(m.position) - b.position.distanceToSquared(m.position));
      if (inRange.length === 0) return;
      const dmg = this.ms.rangedDamage * this.dmgMult();
      for (let i = 0; i < n; i++) {
        // Each bolt asks for its own launch point (the Kaiju cycles through its back vents).
        const from = m.launchOrigin(new THREE.Vector3());
        this.projectiles.fireSpike(from, inRange[i % inRange.length]!, dmg, (i - (n - 1) / 2) * 0.25);
        this.particles.emit('spark', from, 3, 1.2);
      }
    }

  /**
   * Tail Sweep (Kaiju base kit): on its own cooldown, whip the tail at the nearest ground enemy beside or
   * behind; when it lands, everything on the ground in a wedge toward that side takes the hit. Never stops walking.
   */
  private tailSweep(dt: number): void {
    this.tailCd = Math.max(0, this.tailCd - dt);
    const m = this.monster;
    if (!m.kind.tailSweep || this.tailCd > 0 || m.airborne || m.tailSweeping || !m.alive) return;
    const TS = CONFIG.kaiju.tail;
    const from = { x: m.position.x, z: m.position.z };
    const target = tailSweepTarget(from, m.yaw, this.enemyTargets(), TS.reach, TS.rearHalf);
    if (!target) return;
    this.tailCd = TS.cooldown * this.progression.stats.cooldownMult;
    const aim = { x: target.position.x, z: target.position.z };
    m.onTailImpact = () => {
      const at = { x: m.position.x, z: m.position.z };
      const yaw = yawTo(at, aim);
      const dmg = TS.damage * this.dmgMult();
      for (const t of arcTargets(at, yaw, TS.reach, TS.hitHalf, this.enemyTargets())) t.applyDamage(dmg);
      const buildings: Target[] = [];
      this.city.forEachStandingInRadius(at, TS.reach, (t) => buildings.push(t));
      for (const t of arcTargets(at, yaw, TS.reach, TS.hitHalf, buildings)) t.applyDamage(dmg * TS.buildingMult);
      this.tmpV.set(at.x + Math.sin(yaw) * TS.reach * 0.75, 0, at.z + Math.cos(yaw) * TS.reach * 0.75);
      this.particles.ring('dust', this.tmpV, 120, 14);
      this.particles.emit('debris', this.tmpV.setY(15), 8, 1.2);
      this.rig.addTrauma(0.3);
    };
    m.startTailSweep(tailSide(from, m.yaw, aim), TS.timing);
  }

  /** Head-height point the tail swats around and spines fire from (world space). */
  /** Molten Core: heat cools; while hot it burns ground enemies close by. The body's glow follows the heat. */
  private updateCore(dt: number): void {
    const core = this.passives.core();
    const K = CONFIG.passives.core;
    this.heat = core ? coolHeat(this.heat, dt, K.cool) : 0;
    this.monster.heat = this.heat;
    if (!core || !auraOn(this.heat, K.auraAt)) return;
    const p = this.monster.position;
    const dmg = core.dps * dt * this.dmgMult();
    for (const t of footTargets({ x: p.x, z: p.z }, core.radius, this.enemyTargets())) t.applyDamage(dmg);
    if (Math.random() < dt * 10) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * core.radius;
      this.particles.emit('magma', this.tmpV.set(p.x + Math.sin(a) * r, 10, p.z + Math.cos(a) * r), 2, 0.5);
    }
    if (this.heat > 0.9 && Math.random() < dt * 12) this.particles.emit('fire', this.bodyPoint(520), 1, 0.5);
  }

  private bodyPoint(height: number): THREE.Vector3 {
    return this.monster.position.clone().setY(this.monster.position.y + height * CONFIG.monster.scale);
  }

  /** Base kit: the tail lashes at the nearest flyers near the head on a rank-based cooldown. */
  private tailSwat(dt: number): void {
    this.swatCd = Math.max(0, this.swatCd - dt);
    if (this.swatCd > 0 || this.monster.airborne || this.monster.swatting) return;
    const sw = this.passives.swat();
    const head = this.bodyPoint(this.ms.headHeight);
    const flyers = this.enemyTargets().filter((t) => t.airborne && t.isAlive());
    const hits = nearestWithin(head, sw.range, flyers, sw.targets, (t) => t.position);
    if (hits.length === 0) return;
    this.swatCd = sw.cooldown;
    const dmg = sw.damage * this.dmgMult();
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

  /**
   * Overload: the absorbed energy fires back. A truck beam returns down the line and blows up the truck;
   * an orbital strike is cut short and released as a blast around the monster.
   */
  private overload(source: DamageSource, attacker?: Target): void {
    const O = CONFIG.passives.overload;
    const mult = this.dmgMult();
    const from = this.bodyPoint(300);
    if (source === 'beam' && attacker) {
      for (let k = 0; k <= 10; k++) this.particles.emit('spark', from.clone().lerp(attacker.position, k / 10), 3, 0.4);
      attacker.applyDamage(O.reflectDamage * mult);
    } else {
      this.enemies.get<OrbitalLaser>('laser').cancel();
      const p = this.monster.position;
      this.novaWave.start(p, O.blastRadius);
      this.city.forEachStandingInRadius({ x: p.x, z: p.z }, O.blastRadius, (t) => t.applyDamage(O.blastDamage * mult));
      for (const t of this.enemyTargets()) {
        if (Math.hypot(t.position.x - p.x, t.position.z - p.z) <= O.blastRadius + t.radius) t.applyDamage(O.blastDamage * mult);
      }
    }
    this.particles.emit('spark', from, 20, 1.5);
    this.rig.addTrauma(0.4);
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
    if (this.enemies.get<LaserTrucks>('truck').threatening(m)) return true;
    return this.enemies.get<Artillery>('artillery').strikeNear({ x: m.x, z: m.z });
  }

  /** Reflect Shield: projectiles reaching the dome bounce back as spikes at the nearest enemy. */
  private reflectProjectiles(): void {
    const R = CONFIG.passives.reflect;
    const center = this.bodyPoint(300);
    const dmg = R.damage * this.dmgMult();
    const bounce = (from: THREE.Vector3) => {
      // The shield is invisible except for a patch flashing where the shot struck it.
      const at = shieldHitPoint(center, R.radius, from, new THREE.Vector3());
      this.shieldFx.reflectHit(at, at.clone().sub(center));
      const target = nearestInRange({ x: from.x, z: from.z }, this.enemyTargets(), this.ms.rangedRange * 1.5);
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
      this.particles.emit(this.monster.kind.fx.intercept, t.pos, 8, 0.6);
      this.particles.emit('smoke', t.pos, 1, 0.3);
      t.kill();
    }
    if (picks.length > 0) this.particles.emit('spark', this.monster.launchOrigin(this.tmpV), 3, 0.4);
    return picks.length;
  }

  /** Venom Nova: an acid pulse damaging every ground enemy and building in radius. */
  private venomNova(): void {
    const { radius, damage } = this.passives.nova();
    const p = this.monster.position;
    const dmg = damage * this.dmgMult();
    this.novaWave.start(p, radius);
    this.city.forEachStandingInRadius({ x: p.x, z: p.z }, radius, (t) => t.applyDamage(dmg));
    for (const t of footTargets({ x: p.x, z: p.z }, radius, this.enemyTargets())) t.applyDamage(dmg);
    this.particles.ring(this.monster.kind.fx.particle, p, radius * 0.6, 24);
    this.rig.addTrauma(0.25);
    this.monster.body.arms?.spin();
    this.monster.body.nova?.();
  }

  /** Acid Mortar: lob globs at priority ground threats (artillery, SAMs, trucks, then tanks). */
  private acidMortar(globs: number): void {
    const M = CONFIG.passives.mortar;
    const targets = mortarTargets(this.monster.position, M.range, this.enemyTargets(), globs);
    if (targets.length === 0) return;
    const dmg = M.damage * this.dmgMult();
    for (const t of targets) {
      const from = this.monster.launchOrigin(new THREE.Vector3());
      this.projectiles.fireGlob(from, t.position.clone().setY(0), dmg);
      this.particles.emit(this.monster.kind.fx.particle, from, 3, 0.6);
    }
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
        return difficulty(self.progression.level);
      },
      get level() {
        return self.progression.level;
      },
      rng: this.rng,
      particles: this.particles,
      damageMonster: (amount, source, attacker) => this.damageMonster(amount, source, attacker),
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

  /** Chitin Deflection chance. */
  private deflectChance(): number {
    return this.passives.deflectChance();
  }

  /** The only way the monster takes damage. */
  damageMonster(amount: number, source: DamageSource, attacker?: Target): void {
    const m = this.monster;
    if (!m.alive || this.state !== 'playing') return;
    if ((source === 'beam' || source === 'laser') && !this.passives.bubbleActive() && this.passives.tryOverload()) {
      this.overload(source, attacker);
      return;
    }
    const r = resolveHit(amount, source, { dmgMult: difficulty(this.progression.level).dmgMult, deflectChance: this.deflectChance(), airborne: m.airborne, invulnerable: this.passives.bubbleActive() }, Math.random());
    if (r.deflected) {
      this.particles.emit('spark', m.position.clone().setY(300 * CONFIG.monster.scale), 8);
      return;
    }
    if (r.damage <= 0) return;
    m.hp = Math.max(0, m.hp - r.damage);
    m.flash();
    if (this.passives.core()) this.heat = heatAfterHit(this.heat, r.damage, m.maxHp, CONFIG.passives.core.gain);
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
    if (this.state === 'title') {
      this.startFromTitle();
      return;
    }
    if (this.state === 'intro') {
      this.skipIntro();
      return;
    }
    if (this.state !== 'playing') return;
    if (this.abilities.aiming) {
      this.setRay(x, y);
      const g = this.raycaster.ray.intersectPlane(this.groundPlane, this.tmpV);
      if (g) this.leapTo(g.clone());
      return;
    }
    let target = this.pickTarget(x, y);
    // A hurler or lobber cannot hit flyers, so a tap on one is a plain move tap.
    if (target?.airborne && (this.monster.kind.ranged === 'hurl' || this.monster.kind.ranged === 'lob')) target = null;
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
    const r = this.ms.footRadius;
    const dmg = this.ms.footDamage * this.dmgMult();
    this.city.forEachStandingInRadius({ x: p.x, z: p.z }, r, (t) => t.applyDamage(dmg));
    for (const t of footTargets({ x: p.x, z: p.z }, r, this.enemyTargets())) t.applyDamage(dmg);
  }

  /** Claw Rake: everything on the ground in a forward arc within reach; buildings take triple damage. */
  private clawRake(halfAngle: number): void {
    const m = this.monster;
    const from = { x: m.position.x, z: m.position.z };
    const range = this.ms.meleeRange * this.progression.stats.stompRadiusMult;
    const dmg = this.ms.meleeDamage * this.dmgMult();
    for (const t of arcTargets(from, m.yaw, range, halfAngle, this.enemyTargets())) t.applyDamage(dmg);
    const buildings: Target[] = [];
    this.city.forEachStandingInRadius(from, range, (t) => buildings.push(t));
    for (const t of arcTargets(from, m.yaw, range, halfAngle, buildings)) t.applyDamage(dmg * 3);
    for (let i = -2; i <= 2; i++) {
      const a = m.yaw + (i / 2) * halfAngle;
      this.tmpV.set(from.x + Math.sin(a) * range * 0.7, 0, from.z + Math.cos(a) * range * 0.7);
      this.particles.ring('dust', this.tmpV, 60, 6);
      this.particles.emit('debris', this.tmpV.setY(15), 4, 1);
    }
    this.rig.addTrauma(0.3);
  }

  /**
   * Molten Fist lands at `p` (the clamped strike point). Ahead: a slam splashes ground enemies and buildings
   * around the fist. Beside or behind: a backhand sweeps everything in an arc on that side, within reach.
   */
  private fistImpact(p: THREE.Vector3): void {
    const m = this.monster;
    const F = CONFIG.golem.fist;
    const s = this.progression.stats;
    const from = { x: m.position.x, z: m.position.z };
    const dmg = this.ms.meleeDamage * this.dmgMult();
    const bearing = bearingTo(from, m.yaw, p);
    if (fistKind(bearing, F.frontHalf) === 'slam') {
      const r = this.ms.meleeRadius * s.stompRadiusMult;
      const at = { x: p.x, z: p.z };
      this.city.forEachStandingInRadius(at, r, (t) => t.applyDamage(dmg * F.buildingMult));
      for (const t of footTargets(at, r, this.enemyTargets())) t.applyDamage(dmg);
      this.particles.ring('dust', p, r, 16);
      this.particles.emit('magma', this.tmpV.copy(p).setY(20), 12, 1.2);
      this.particles.emit('debris', this.tmpV.copy(p).setY(10), 8, 1.1);
      this.rig.addTrauma(0.35);
      return;
    }
    const reach = this.ms.meleeRange * s.stompRadiusMult;
    const yaw = backhandYaw(m.yaw, bearing, F.backhandCenter);
    for (const t of arcTargets(from, yaw, reach, F.backhandHalf, this.enemyTargets())) t.applyDamage(dmg);
    const buildings: Target[] = [];
    this.city.forEachStandingInRadius(from, reach, (t) => buildings.push(t));
    for (const t of arcTargets(from, yaw, reach, F.backhandHalf, buildings)) t.applyDamage(dmg * F.buildingMult);
    for (let i = -2; i <= 2; i++) {
      const a = yaw + (i / 2) * F.backhandHalf;
      this.tmpV.set(from.x + Math.sin(a) * reach * 0.7, 0, from.z + Math.cos(a) * reach * 0.7);
      this.particles.ring('dust', this.tmpV, 60, 6);
      this.particles.emit('debris', this.tmpV.setY(15), 3, 1);
    }
    this.rig.addTrauma(0.3);
  }

  private meleeImpact(p: THREE.Vector3): void {
    const shape = this.monster.kind.melee;
    if (shape.kind === 'fist') {
      this.fistImpact(p);
      return;
    }
    if (shape.kind === 'arc') {
      this.clawRake(shape.halfAngle);
      return;
    }
    const s = this.progression.stats;
    const r = this.ms.meleeRadius * s.stompRadiusMult;
    const dmg = this.ms.meleeDamage * this.dmgMult();
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
      // A breather only picks targets its neck can reach, so the body never has to turn away from its path.
      const reach = this.ms.meleeRange * 0.8;
      const groundOnly = m.kind.ranged === 'hurl' || m.kind.ranged === 'lob';
      const rangedPool =
        m.kind.ranged === 'breath' ? this.enemyTargets().filter((t) => this.canBreatheAt(t))
        : groundOnly ? this.enemyTargets().filter((t) => !t.airborne && Math.hypot(t.position.x - pos.x, t.position.z - pos.z) > reach)
        : this.enemyTargets();
      const auto = nearestInRange(pos, rangedPool, this.ms.rangedRange);
      const autoMelee = nearestInRange(pos, this.enemyTargets().filter((t) => !t.airborne), this.ms.meleeRange);
      if (this.order?.kind === 'attack' && this.order.target.airborne && groundOnly) {
        this.order = null;
        this.markers.setTarget(null);
      }
      const order: BrainOrder =
        this.order?.kind === 'attack' ? { kind: 'attack', target: this.toBrain(this.order.target) } : this.order;
      const d = decide({
        pos,
        order,
        auto: auto ? this.toBrain(auto) : null,
        autoMelee: autoMelee ? this.toBrain(autoMelee) : null,
        meleeRange: this.ms.meleeRange,
        spikeRange: this.ms.rangedRange,
        meleeReady: m.kind.melee.kind === 'multi' ? false : m.meleeReady(),
        spikeReady: m.rangedReady(),
        arriveRadius: CONFIG.monster.arriveRadius,
      });
      if (d.orderDone) {
        this.order = null;
        this.markers.setTarget(null);
      }
      if (d.moveTo) m.moveToward(d.moveTo, dt, s.moveSpeedMult);
      else if (d.face) m.faceToward(d.face, dt);
      // An arc melee only strikes forward: turn to a target outside the arc first.
      const shape = m.kind.melee;
      const outsideArc =
        d.attack === 'melee' && d.meleeAt !== null && shape.kind === 'arc' && !inArc(pos, m.yaw, Infinity, shape.halfAngle, d.meleeAt);
      if (outsideArc && !d.moveTo && !d.face && d.meleeAt) m.faceToward(d.meleeAt, dt);
      if (d.attack === 'melee' && d.meleeAt && !outsideArc) {
        const plan = strikePlan(pos, m.yaw, d.meleeAt, this.ms.meleeRange);
        m.startMelee(s.cooldownMult, plan.leg, plan.point);
      }
      if (d.attack === 'ranged') this.fireRanged(d.attackOn === 'order' && this.order?.kind === 'attack' ? this.order.target : auto);
    }
    m.tick(dt);

    if (!m.airborne) this.city.forEachStandingInRadius(pos, this.ms.bodyRadius, (t) => t.applyDamage(CONFIG.monster.contactDps * dt));
    m.hp = regen(m.hp, m.maxHp, CONFIG.monster.regenPerSec + s.regenBonus, dt);
  }

  private fireRanged(target: Target | null): void {
    if (this.monster.kind.ranged === 'breath') this.breathAt(target);
    else if (this.monster.kind.ranged === 'hurl') this.hurlAt(target);
    else if (this.monster.kind.ranged === 'lob') this.lobAt(target);
    else this.fireSpikes(target);
  }

  /**
   * Tentacle Slam: every free arm takes the nearest unclaimed ground enemy (or the ordered target) within
   * reach on any side; the body never turns. Damage lands in onArmImpact.
   */
  private tentacleSlams(): void {
    const m = this.monster;
    const arms = m.body.arms;
    if (!arms || m.kind.melee.kind !== 'multi' || !m.alive || m.busy) return;
    const free = arms.freeArms();
    if (free.length === 0) return;
    const busy = arms.striking();
    const ordered = this.order?.kind === 'attack' && !this.order.target.airborne ? this.order.target : null;
    const cands = this.enemyTargets().filter((t) => !t.airborne && !busy.has(t));
    if (ordered && !busy.has(ordered) && !cands.includes(ordered)) cands.push(ordered);
    const from = { x: m.position.x, z: m.position.z };
    const cd = this.ms.meleeCooldown * this.progression.stats.cooldownMult;
    for (const { arm, target } of assignStrikes(free, m.yaw, from, cands, this.ms.meleeRange)) {
      arms.start(arm, 'slam', target.position, target, cd, this.ms.meleeTiming);
    }
  }

  /** Magma Lob: back vents (1 + extra-projectile upgrades) lob bombs at the target and its nearest ground neighbours. */
  private lobAt(target: Target | null): void {
    if (!target || target.airborne) return;
    const m = this.monster;
    const from = { x: m.position.x, z: m.position.z };
    const count = 1 + this.progression.stats.extraSpikes;
    const others = this.enemyTargets()
      .filter((t) => t.isAlive() && !t.airborne && Math.hypot(t.position.x - from.x, t.position.z - from.z) <= this.ms.rangedRange)
      .sort((a, b) => a.position.distanceToSquared(target.position) - b.position.distanceToSquared(target.position));
    const dmg = this.ms.rangedDamage * this.dmgMult();
    for (const t of spikeTargets(target, others, count)) {
      const vent = m.launchOrigin(new THREE.Vector3());
      this.projectiles.fireBomb(vent, t.position.clone().setY(0), dmg);
      this.particles.emit('magma', vent, 5, 0.7);
      this.particles.emit('smoke', vent, 2, 0.4);
    }
    m.consumeRanged(this.rangedCdMult());
  }

  /** Hurl: free arms (1 + extra-projectile upgrades) throw rubble at the target and its nearest neighbours. */
  private hurlAt(target: Target | null): void {
    const m = this.monster;
    const arms = m.body.arms;
    if (!target || !arms || target.airborne) return;
    const free = arms.freeArms();
    if (free.length === 0) return;
    const from = { x: m.position.x, z: m.position.z };
    const count = Math.min(free.length, 1 + this.progression.stats.extraSpikes);
    const others = this.enemyTargets()
      .filter((t) => t.isAlive() && !t.airborne && Math.hypot(t.position.x - from.x, t.position.z - from.z) <= this.ms.rangedRange)
      .sort((a, b) => a.position.distanceToSquared(target.position) - b.position.distanceToSquared(target.position));
    const H = CONFIG.kraken.arms.hurl;
    let left = free;
    let started = false;
    for (const t of spikeTargets(target, others, count)) {
      const pick = assignStrikes(left, m.yaw, from, [t], Infinity)[0];
      if (!pick) break;
      arms.start(pick.arm, 'hurl', t.position, t, 0, H.timing);
      left = left.filter((a) => a !== pick.arm);
      started = true;
    }
    if (started) m.consumeRanged(this.rangedCdMult());
  }

  /** An arm's strike lands: a slam hits around its tip; a hurl releases its chunk from the tip. */
  private onArmImpact = (arm: number, s: ArmStrike): void => {
    const arms = this.monster.body.arms!;
    if (s.kind === 'hurl') {
      const tip = arms.tips[arm]!;
      this.projectiles.fireChunk(tip.clone(), s.target.clone().setY(0), this.ms.rangedDamage * this.dmgMult());
      this.particles.emit('debris', tip, 6, 0.8);
      return;
    }
    const at = { x: s.target.x, z: s.target.z };
    const r = this.ms.meleeRadius * this.progression.stats.stompRadiusMult;
    const dmg = this.ms.meleeDamage * this.dmgMult();
    this.city.forEachStandingInRadius(at, r, (t) => t.applyDamage(dmg));
    for (const t of footTargets(at, r, this.enemyTargets())) t.applyDamage(dmg);
    this.tmpV.set(at.x, 0, at.z);
    this.particles.ring('dust', this.tmpV, r, 10);
    this.particles.emit('debris', this.tmpV.setY(10), 6, 1);
    this.rig.addTrauma(0.12);
  };

  /** The Kaiju's neck can turn to `t` without the body turning. */
  private canBreatheAt(t: Target): boolean {
    const m = this.monster;
    return canAim({ x: m.position.x, z: m.position.z }, m.yaw, t.position, CONFIG.kaiju.neck.limit);
  }

  /** Plasma Breath: start charging at the target; hits land when it fires (onBreathFire). */
  private breathAt(target: Target | null): void {
    if (!target || this.breath.busy || !this.canBreatheAt(target)) return;
    this.breath.start(target.position, 1 + this.progression.stats.extraSpikes);
    this.monster.consumeRanged(this.rangedCdMult());
  }

  /** Each beam hits every enemy (ground or air) and building along its line, from the jaws to the beam's end. */
  private onBreathFire = (from: THREE.Vector3, ends: readonly THREE.Vector3[]): void => {
    const B = CONFIG.kaiju.breath;
    const a = { x: from.x, z: from.z };
    const mult = this.dmgMult();
    const enemies = new Set<Target>();
    const buildings = new Set<Target>();
    for (const e of ends) {
      const b = { x: e.x, z: e.z };
      for (const t of lineTargets(a, b, B.halfWidth, this.enemyTargets())) enemies.add(t);
      for (const p of linePoints(a, b, B.halfWidth * 1.5)) this.city.forEachStandingInRadius(p, B.halfWidth, (t) => buildings.add(t));
      for (let k = 1; k <= 8; k++) this.particles.emit('fire', this.tmpV.set(a.x + (b.x - a.x) * (k / 8), 20, a.z + (b.z - a.z) * (k / 8)), 2, 0.5);
      this.particles.explosion(e, 0.8);
    }
    for (const t of enemies) t.applyDamage(this.ms.rangedDamage * mult);
    for (const t of buildings) t.applyDamage(B.buildingDamage * mult);
    this.particles.emit('spark', this.monster.rangedOrigin(this.tmpV), 10, 1.5);
    this.rig.addTrauma(0.25);
  };

  private fireSpikes(target: Target | null): void {
    if (!target) return;
    const m = this.monster;
    const s = this.progression.stats;
    const count = 1 + s.extraSpikes;
    const pos = { x: m.position.x, z: m.position.z };
    const others = this.enemyTargets()
      .filter((t) => t.isAlive() && Math.hypot(t.position.x - pos.x, t.position.z - pos.z) <= this.ms.rangedRange)
      .sort((a, b) => a.position.distanceToSquared(target.position) - b.position.distanceToSquared(target.position));
    const from = m.rangedOrigin(new THREE.Vector3());
    spikeTargets(target, others, count).forEach((t, i) => {
      this.projectiles.fireSpike(from, t, this.ms.rangedDamage * this.dmgMult(), (i - (count - 1) / 2) * CONFIG.monster.spikeSpreadRad);
    });
    this.particles.emit('spark', from, 4);
    m.consumeRanged(this.rangedCdMult());
  }

  private onProjectileHit = (h: Hit): void => {
    if (h.kind === 'bomb') {
      const L = CONFIG.golem.lob;
      const at = { x: h.point.x, z: h.point.z };
      this.city.forEachStandingInRadius(at, L.splash, (t) => t.applyDamage(h.damage));
      for (const t of footTargets(at, L.splash, this.enemyTargets())) t.applyDamage(h.damage);
      if (this.state === 'playing') this.acid.add(h.point.clone().setY(0), L.poolRadius, L.poolLife);
      this.particles.ring('magma', h.point, L.splash, 12);
      this.particles.emit('magma', h.point, 10, 1.2);
      this.particles.emit('smoke', h.point, 3, 0.6);
      this.rig.addTrauma(0.15);
      return;
    }
    if (h.kind === 'chunk') {
      const r = CONFIG.kraken.arms.hurl.splash;
      const at = { x: h.point.x, z: h.point.z };
      this.city.forEachStandingInRadius(at, r, (t) => t.applyDamage(h.damage));
      for (const t of footTargets(at, r, this.enemyTargets())) t.applyDamage(h.damage);
      this.particles.ring('dust', h.point, r, 12);
      this.particles.emit('debris', h.point, 12, 1.2);
      this.rig.addTrauma(0.15);
      return;
    }
    if (h.kind === 'glob') {
      const r = this.passives.mortarSplash();
      this.city.forEachStandingInRadius({ x: h.point.x, z: h.point.z }, r, (t) => t.applyDamage(h.damage));
      for (const t of footTargets({ x: h.point.x, z: h.point.z }, r, this.enemyTargets())) t.applyDamage(h.damage);
      this.particles.ring(this.monster.kind.fx.particle, h.point, r, 14);
      this.particles.emit(this.monster.kind.fx.particle, h.point, 10, 1);
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

  /** Konami-code cheat: grants exactly the EXP still needed for the next level; that level's offer lists every choice. */
  private cheatLevelUp = (): void => {
    if (this.state !== 'playing' || !this.monster.alive) return;
    const exp = expToNext(this.progression.level) - this.progression.exp;
    this.progression.addExp(exp);
    this.cheatLevels++;
    this.events.emit('expGain', exp);
    this.startLevelUpMoment();
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
    this.intro.dispose();
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    this.pixel.dispose();
    this.events.removeAll();
  }
}
