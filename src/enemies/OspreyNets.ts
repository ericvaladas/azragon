import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { faceted, toonMat } from '../render/toon';
import type { EnemySystem, WorldContext } from './types';
import { Cloth, type ClothBody, type ClothEnv } from './cloth';
import {
  NET_N, NET_SEGMENTS, carriedGrid, domeRadius, dropOutcome, gridSegments, newGrid, newSquad, positionDone, slotOffset,
  squadGone, startLeave, stepSquad, type MonsterInfo, type P3, type Squad,
} from './ospreyMath';
import { escaped } from './retreat';
import { PODS, ROTOR_HUB, bodyGeometry, podGeometry, rotorDiscGeometry, rotorGeometry } from './ospreyModel';

const O = CONFIG.osprey;
const P = CONFIG.palette;
const SQUAD = 4;
/** Hover bob while flying (m) and its rate (rad/s), offset per slot so the four don't move in lockstep. */
const BOB = 4;
const BOB_RATE = 1.7;
const _v = new THREE.Vector3();

export type NetMode = 'carried' | 'falling' | 'snared' | 'ground';

/** Net grid points held by slots 0..3 (front-left, front-right, back-right, back-left), in carriedGrid's corner order. */
const CORNERS = [0, NET_N, (NET_N + 1) * (NET_N + 1) - 1, NET_N * (NET_N + 1)] as const;

/**
 * A net, simulated as cloth: carried (corners pinned under its squad), falling (released; homing over the monster
 * if it was dropped on it), snared (resting and caught on the monster), or on the ground (fading out).
 */
type Net = {
  mode: NetMode;
  t: number;
  toMonster: boolean;
  cloth: Cloth;
  pts: P3[];
  mesh: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** The weights on the corners (CORNERS order), sharing one material that fades with the net. */
  weights: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>[];
};

/** A squad: its shared flight, its four Ospreys in slot order, and the net while they still carry it. */
type Team = { squad: Squad; ospreys: Osprey[]; net: Net | null };

class Osprey implements Target {
  readonly kind = 'osprey' as const;
  readonly airborne = true;
  readonly radius = O.hitRadius;
  readonly group = new THREE.Group();
  readonly position = this.group.position;
  readonly pods: THREE.Group[] = [];
  readonly rotors: THREE.Group[] = [];
  hp: number;
  crashing = false;
  /** Out of the scene: crashed, or gone with its squad. */
  gone = false;
  flashT = 0;
  /** Crash fall: vertical speed, roll, roll rate and the trail clock. */
  vy = 0;
  bank = 0;
  spin = 0;
  /** Taken quietly: it vanishes below the ground instead of crashing. */
  silent = false;
  trailT = 0;

  constructor(
    readonly team: Team,
    readonly slot: number,
    readonly material: THREE.MeshToonMaterial,
    hp: number,
    private onDamage: (o: Osprey, amount: number) => void,
  ) {
    this.hp = hp;
  }

  isAlive(): boolean {
    return !this.crashing && !this.gone;
  }

  applyDamage(amount: number): void {
    this.onDamage(this, amount);
  }
}

/**
 * Osprey Net squads: four Ospreys fly in carrying a net between them, track the monster while they sink and spread
 * it open, and drop it on the monster (snaring it) if at least CONFIG.osprey.minToDrop are still flying; with fewer,
 * the net falls to the ground. Then they fly out. The snared net stays draped on the monster until GameScene reports
 * the snare has ended (netTornFree). While the army retreats the squad drops no net and flies out with it.
 */
export class OspreyNets implements EnemySystem {
  readonly kind = 'osprey' as const;
  private ctx: WorldContext | null = null;
  private teams: Team[] = [];
  private nets: Net[] = [];
  private all: Osprey[] = [];
  private clock = 0;
  /** Reused per step: the monster as the cloth sees it, and the cloth's surroundings. */
  private bodyFrame: ClothBody = { x: 0, y: 0, z: 0, yaw: 0, surface: () => 0 };
  private env: ClothEnv = { groundY: O.groundY, body: null, grip: false, catchMin: 0, homeTo: null };
  private body = bodyGeometry();
  private podGeo = podGeometry();
  private rotorGeo = rotorGeometry();
  private discGeo = rotorDiscGeometry();
  private weightGeo = faceted(new THREE.IcosahedronGeometry(O.cloth.weightSize / 2, 0));
  private rotorMat = toonMat(P.ospreyRotor);
  private discMat = new THREE.MeshBasicMaterial({ color: P.ospreyRotor, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

  constructor(private scene: THREE.Scene) {}

  targets(): readonly Target[] {
    return this.all;
  }

  count(): number {
    return this.teams.length;
  }

  /** Each net's state, oldest first. */
  netModes(): readonly NetMode[] {
    return this.nets.map((n) => n.mode);
  }

  clear(): void {
    for (const o of this.all) this.scene.remove(o.group);
    for (const n of this.nets) this.dropNet(n);
    this.teams = [];
    this.nets = [];
    this.all = [];
  }

  spawn(ctx: WorldContext): void {
    this.ctx = ctx;
    if (this.teams.length >= CONFIG.spawns.osprey.cap) return;
    const m = ctx.monster.position;
    const d = ctx.spawnDir();
    // Squad bearings put x on sin, z on cos.
    const team: Team = { squad: newSquad({ x: m.x, z: m.z }, Math.atan2(d.x, d.z), ctx.monster.bodyRadius), ospreys: [], net: null };
    for (let slot = 0; slot < SQUAD; slot++) {
      const mat = toonMat(0xffffff, { vertexColors: true });
      const o = new Osprey(team, slot, mat, O.hp * ctx.difficulty.hpMult, this.damage);
      const body = new THREE.Mesh(this.body, mat);
      body.castShadow = true;
      o.group.add(body);
      for (const pivot of PODS) {
        const pod = new THREE.Group();
        pod.position.copy(pivot);
        pod.add(new THREE.Mesh(this.podGeo, mat));
        const rotor = new THREE.Group();
        rotor.position.copy(ROTOR_HUB);
        rotor.add(new THREE.Mesh(this.rotorGeo, this.rotorMat), new THREE.Mesh(this.discGeo, this.discMat));
        pod.add(rotor);
        o.pods.push(pod);
        o.rotors.push(rotor);
        o.group.add(pod);
      }
      team.ospreys.push(o);
      this.all.push(o);
      this.scene.add(o.group);
    }
    this.teams.push(team);
    this.placeTeam(team, 0);
    team.net = this.makeNet(team);
    // Measure the monster's surface now, while the squad is far off, rather than on the frame the net drops.
    ctx.monster.surface(0, 0);
  }

  /** Each net's points (row-major grid). */
  netPoints(k: number): readonly P3[] {
    return this.nets[k]?.pts ?? [];
  }

  /** Called by GameScene when the snare runs out (or the monster dies): the net bursts loose and drops off. */
  netTornFree(): void {
    const ctx = this.ctx;
    for (const n of this.nets) {
      if (n.mode !== 'snared') continue;
      this.toGround(n);
      if (!ctx) continue;
      const m = ctx.monster.position;
      // One cut line in each half of the net, each way: it breaks into nine ragged pieces thrown off the monster.
      const cut = () => [2 + Math.floor(ctx.rng() * 3), NET_N / 2 + 1 + Math.floor(ctx.rng() * 3)];
      n.cloth.tear(cut(), cut());
      n.cloth.kick(m.x, m.z, O.cloth.tearOut, O.cloth.tearUp);
      ctx.particles.emit('debris', _v.set(m.x, ctx.monster.height * 0.6, m.z), 18, 1.6);
      ctx.particles.ring('dust', _v.set(m.x, 0, m.z), domeRadius(ctx.monster.bodyRadius, ctx.monster.width), 16);
    }
  }

  private damage = (o: Osprey, amount: number): void => {
    if (!o.isAlive()) return;
    o.hp -= amount;
    o.flashT = 0.1;
    if (o.hp > 0) return;
    o.crashing = true;
    o.spin = (Math.random() < 0.5 ? -1 : 1) * 2.5;
    if (this.ctx?.quiet) {
      o.silent = true;
      o.position.y = -1;
    } else {
      this.ctx?.particles.explosion(o.position, 1.2);
      this.ctx?.particles.emit('smoke', o.position, 6, 0.8);
    }
    const team = o.team;
    // Too few left to hold the net up: the drop is off at once. A retreating squad drops nothing.
    if (this.ctx?.retreating !== true && team.net?.mode === 'carried' && dropOutcome(this.living(team)) === 'abort') {
      const m = this.ctx!.monster.position;
      this.abort(team);
      startLeave(team.squad, { x: m.x, z: m.z });
    }
    this.ctx?.onDestroyed(o, O.exp);
  };

  update(dt: number, ctx: WorldContext): void {
    this.ctx = ctx;
    this.clock += dt;
    const info = this.info(ctx);
    const m = ctx.monster.position;
    const retreating = ctx.retreating === true;
    for (let i = this.teams.length - 1; i >= 0; i--) {
      const team = this.teams[i]!;
      // Leaving: the net, if still carried, stays slung and goes with the squad.
      if (retreating && team.squad.phase !== 'leave') startLeave(team.squad, { x: m.x, z: m.z });
      stepSquad(team.squad, dt, info);
      if (!retreating && positionDone(team.squad) && team.net?.mode === 'carried') {
        if (dropOutcome(this.living(team)) === 'release') this.release(team);
        else this.abort(team);
        startLeave(team.squad, { x: m.x, z: m.z });
      }
      this.placeTeam(team, dt);
      for (const o of team.ospreys) if (o.crashing && !o.gone && this.crash(o, dt, ctx)) this.remove(o);
      const gone = retreating ? escaped(team.squad, m) : squadGone(team.squad, { x: m.x, z: m.z });
      if (gone || team.ospreys.every((o) => o.gone)) {
        for (const o of team.ospreys) if (!o.gone) this.remove(o);
        // A net still slung leaves with its squad.
        if (team.net) {
          this.dropNet(team.net);
          this.nets = this.nets.filter((n) => n !== team.net);
        }
        this.teams.splice(i, 1);
      }
    }
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const n = this.nets[i]!;
      if (this.updateNet(n, dt, ctx)) continue;
      this.dropNet(n);
      this.nets.splice(i, 1);
    }
  }

  private info(ctx: WorldContext): MonsterInfo {
    const m = ctx.monster;
    return { x: m.position.x, z: m.position.z, height: m.height, bodyRadius: m.bodyRadius };
  }

  private living(team: Team): number {
    return team.ospreys.filter((o) => o.isAlive()).length;
  }

  /** Flies each living Osprey in its slot, swivels the pods, spins rotors, fades hit flashes, and hangs a carried net. */
  private placeTeam(team: Team, dt: number): void {
    const s = team.squad;
    for (const o of team.ospreys) {
      if (o.gone) continue;
      o.flashT = Math.max(0, o.flashT - dt);
      o.material.emissive.setHex(o.flashT > 0 ? 0xffffff : 0x000000);
      for (const r of o.rotors) r.rotation.z += O.rotorSpin * (o.crashing ? 0.3 : 1) * dt;
    }
    for (const o of team.ospreys) {
      if (!o.isAlive()) {
        team.net?.cloth.pin(CORNERS[o.slot]!, null);
        continue;
      }
      const off = slotOffset(o.slot, s.half, s.yaw);
      o.position.set(s.x + off.x, s.y + Math.sin(this.clock * BOB_RATE + o.slot) * BOB, s.z + off.z);
      o.group.rotation.set(0, s.yaw, 0);
      for (const pod of o.pods) pod.rotation.x = -s.tilt;
      if (team.net?.mode === 'carried') team.net.cloth.pin(CORNERS[o.slot]!, _v.set(o.position.x, o.position.y - O.cable, o.position.z));
    }
  }

  /** Falls, rolls, trails smoke and blows up on the ground (as the napalm bombers do). True once it has hit. */
  private crash(o: Osprey, dt: number, ctx: WorldContext): boolean {
    const yaw = o.team.squad.yaw;
    o.vy -= 120 * dt;
    o.position.x += Math.sin(yaw) * O.cruiseSpeed * 0.3 * dt;
    o.position.z += Math.cos(yaw) * O.cruiseSpeed * 0.3 * dt;
    o.position.y += o.vy * dt;
    o.bank += o.spin * dt;
    o.group.rotation.set(0, yaw, o.bank);
    o.trailT += dt;
    if (o.trailT > 0.05) {
      o.trailT = 0;
      ctx.particles.emit('smoke', o.position, 1, 0.3);
      ctx.particles.emit('fire', o.position, 1, 0.2);
    }
    if (o.position.y > 0) return false;
    if (o.silent) return true;
    const p = o.position.clone().setY(0);
    ctx.particles.explosion(p, 2);
    ctx.particles.ring('dust', p, 120, 12);
    ctx.splash(p, 2);
    ctx.shake(0.3);
    return true;
  }

  private remove(o: Osprey): void {
    o.gone = true;
    this.scene.remove(o.group);
    o.material.dispose();
    this.all = this.all.filter((x) => x !== o);
  }

  private release(team: Team): void {
    const net = team.net!;
    net.cloth.release();
    net.mode = 'falling';
    net.toMonster = true;
    team.net = null;
  }

  private abort(team: Team): void {
    const net = team.net!;
    net.cloth.release();
    net.mode = 'falling';
    net.toMonster = false;
    team.net = null;
  }

  /** Lets go of the monster: the net drops to the ground and fades out over groundLife. */
  private toGround(net: Net): void {
    net.cloth.release();
    net.mode = 'ground';
    net.t = 0;
  }

  /** Where a net dropped on the monster homes: the leap's landing point while it is in the air, else the monster. */
  private target(ctx: WorldContext): { x: number; z: number } {
    const m = ctx.monster;
    return m.airborne && m.leapTo ? m.leapTo : { x: m.position.x, z: m.position.z };
  }

  /**
   * Lands a net on the monster: earlier snared nets drop off, the snare starts (or restarts), and the ground shakes.
   * A monster already dead gets no snare; the net drops to the ground.
   */
  private land(net: Net, ctx: WorldContext): void {
    if (!ctx.monster.alive) {
      this.toGround(net);
      return;
    }
    for (const n of this.nets) if (n !== net && n.mode === 'snared') this.toGround(n);
    net.mode = 'snared';
    ctx.snareMonster(CONFIG.snare.duration);
    ctx.shake(O.landShake);
    const m = ctx.monster.position;
    ctx.particles.ring('dust', _v.set(m.x, 0, m.z), domeRadius(ctx.monster.bodyRadius, ctx.monster.width), 20);
  }

  /** Advances one net's cloth; false once it should be removed. */
  private updateNet(net: Net, dt: number, ctx: WorldContext): boolean {
    const m = ctx.monster;
    const f = this.bodyFrame;
    f.x = m.position.x;
    f.y = m.position.y;
    f.z = m.position.z;
    f.yaw = m.yaw;
    f.surface = m.surface;
    const e = this.env;
    // Only a released net meets the monster: a carried one hangs clear of it, a ground one is never scooped back up,
    // and a dead monster's pose no longer matches its surface.
    e.body = net.mode === 'falling' || net.mode === 'snared' ? (m.alive ? f : null) : null;
    e.grip = net.mode === 'snared';
    e.catchMin = m.height * O.cloth.catchFrac;
    e.homeTo = net.mode === 'falling' && net.toMonster ? this.target(ctx) : null;
    net.cloth.step(dt, e);
    if (net.mode === 'falling') {
      if (net.toMonster && (net.cloth.touchedBody || net.cloth.touchedGround)) this.land(net, ctx);
      else if (!net.toMonster && net.cloth.touchedGround) this.toGround(net);
    } else if (net.mode === 'ground') {
      net.t += dt;
      const fade = Math.max(0, Math.min(1, O.groundLife - net.t));
      net.mesh.material.opacity = fade;
      net.weights[0]!.material.opacity = fade;
      if (net.t >= O.groundLife) return false;
    }
    net.cloth.write(net.pts);
    this.drawNet(net);
    return true;
  }

  /** A net laid out flat between the squad's Ospreys, its ropes long enough to sag between them. */
  private makeNet(team: Team): Net {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NET_SEGMENTS * 6), 3));
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: P.netRope, transparent: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const s = team.squad;
    const corners = team.ospreys.map((o) => ({ x: o.position.x, y: o.position.y - O.cable, z: o.position.z }));
    const pts = newGrid();
    carriedGrid(corners, 0, pts);
    const cloth = new Cloth(NET_N + 1, (2 * s.half * (1 + O.cloth.slack)) / NET_N);
    cloth.layout(pts);
    for (const o of team.ospreys) cloth.pin(CORNERS[o.slot]!, corners[o.slot]!);
    for (const k of CORNERS) cloth.setWeight(k, O.cloth.cornerMass, O.cloth.cornerPull);
    const weightMat = toonMat(P.ospreyDark);
    weightMat.transparent = true;
    const weights = CORNERS.map(() => {
      const w = new THREE.Mesh(this.weightGeo, weightMat);
      w.castShadow = true;
      this.scene.add(w);
      return w;
    });
    const net: Net = { mode: 'carried', t: 0, toMonster: false, cloth, pts, mesh, weights };
    this.nets.push(net);
    this.drawNet(net);
    return net;
  }

  private drawNet(net: Net): void {
    const attr = net.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    gridSegments(net.pts, attr.array as Float32Array, net.cloth.joinedFn);
    attr.needsUpdate = true;
    CORNERS.forEach((k, c) => net.weights[c]!.position.set(net.pts[k]!.x, net.pts[k]!.y, net.pts[k]!.z));
  }

  private dropNet(net: Net): void {
    this.scene.remove(net.mesh);
    net.mesh.geometry.dispose();
    net.mesh.material.dispose();
    for (const w of net.weights) this.scene.remove(w);
    net.weights[0]!.material.dispose();
  }
}
