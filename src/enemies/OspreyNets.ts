import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Target } from '../combat';
import { toonMat } from '../render/toon';
import type { EnemySystem, WorldContext } from './types';
import {
  NET_SEGMENTS, blendGrid, carriedGrid, domeGrid, domeRadius, dropOutcome, gridSegments, groundGrid, netCorners, newGrid,
  newSquad, positionDone, slotOffset, squadGone, startLeave, stepSquad, type MonsterInfo, type P3, type Squad,
} from './ospreyMath';
import { PODS, ROTOR_HUB, bodyGeometry, podGeometry, rotorDiscGeometry, rotorGeometry } from './ospreyModel';

const O = CONFIG.osprey;
const P = CONFIG.palette;
const SQUAD = 4;
/** Hover bob while flying (m) and its rate (rad/s), offset per slot so the four don't move in lockstep. */
const BOB = 4;
const BOB_RATE = 1.7;
const _v = new THREE.Vector3();

export type NetMode = 'carried' | 'falling' | 'snared' | 'ground' | 'torn';

/**
 * A net: carried under its squad, falling (blending from where it was released to where it lands), snared on the
 * monster, lying on the ground after an aborted drop, or torn (removed on the next update).
 */
type Net = {
  mode: NetMode;
  t: number;
  toMonster: boolean;
  start: P3[];
  pts: P3[];
  ground: { x: number; z: number; half: number; yaw: number };
  mesh: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
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
 * the snare has ended (netTornFree).
 */
export class OspreyNets implements EnemySystem {
  readonly kind = 'osprey' as const;
  private ctx: WorldContext | null = null;
  private teams: Team[] = [];
  private nets: Net[] = [];
  private all: Osprey[] = [];
  private clock = 0;
  private scratch = newGrid();
  private body = bodyGeometry();
  private podGeo = podGeometry();
  private rotorGeo = rotorGeometry();
  private discGeo = rotorDiscGeometry();
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
    const team: Team = { squad: newSquad({ x: m.x, z: m.z }, ctx.rng() * Math.PI * 2), ospreys: [], net: null };
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
    team.net = this.makeNet();
    this.teams.push(team);
    this.placeTeam(team, 0);
    this.drawNet(team.net);
  }

  /** Called by GameScene when the snare runs out: the draped net bursts apart. */
  netTornFree(): void {
    const ctx = this.ctx;
    for (const n of this.nets) {
      if (n.mode !== 'snared') continue;
      n.mode = 'torn';
      if (!ctx) continue;
      const c = this.domeCentre(ctx);
      ctx.particles.emit('debris', _v.set(c.x, ctx.monster.height * 0.6, c.z), 18, 1.6);
      ctx.particles.ring('dust', _v.set(c.x, 0, c.z), domeRadius(ctx.monster.bodyRadius, ctx.monster.width), 16);
    }
  }

  private damage = (o: Osprey, amount: number): void => {
    if (!o.isAlive()) return;
    o.hp -= amount;
    o.flashT = 0.1;
    if (o.hp > 0) return;
    o.crashing = true;
    o.spin = (Math.random() < 0.5 ? -1 : 1) * 2.5;
    this.ctx?.particles.explosion(o.position, 1.2);
    this.ctx?.particles.emit('smoke', o.position, 6, 0.8);
    const team = o.team;
    // Too few left to hold the net up: the drop is off at once.
    if (team.net?.mode === 'carried' && dropOutcome(this.living(team)) === 'abort') {
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
    for (let i = this.teams.length - 1; i >= 0; i--) {
      const team = this.teams[i]!;
      stepSquad(team.squad, dt, info);
      if (positionDone(team.squad) && team.net?.mode === 'carried') {
        if (dropOutcome(this.living(team)) === 'release') this.release(team);
        else this.abort(team);
        startLeave(team.squad, { x: m.x, z: m.z });
      }
      this.placeTeam(team, dt);
      for (const o of team.ospreys) if (o.crashing && !o.gone && this.crash(o, dt, ctx)) this.remove(o);
      if (squadGone(team.squad, { x: m.x, z: m.z }) || team.ospreys.every((o) => o.gone)) {
        for (const o of team.ospreys) if (!o.gone) this.remove(o);
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
    const hung: (P3 | null)[] = [];
    for (const o of team.ospreys) {
      if (o.gone) continue;
      o.flashT = Math.max(0, o.flashT - dt);
      o.material.emissive.setHex(o.flashT > 0 ? 0xffffff : 0x000000);
      for (const r of o.rotors) r.rotation.z += O.rotorSpin * (o.crashing ? 0.3 : 1) * dt;
    }
    for (const o of team.ospreys) {
      if (!o.isAlive()) {
        hung.push(null);
        continue;
      }
      const off = slotOffset(o.slot, s.half, s.yaw);
      o.position.set(s.x + off.x, s.y + Math.sin(this.clock * BOB_RATE + o.slot) * BOB, s.z + off.z);
      o.group.rotation.set(0, s.yaw, 0);
      for (const pod of o.pods) pod.rotation.x = -s.tilt;
      hung.push(o.position);
    }
    if (team.net?.mode === 'carried') carriedGrid(netCorners(hung, s.half), s.half * O.sag, team.net.pts);
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
    this.letGo(net);
    net.toMonster = true;
    team.net = null;
  }

  private abort(team: Team): void {
    const net = team.net!;
    const s = team.squad;
    this.letGo(net);
    net.toMonster = false;
    net.ground = { x: s.x, z: s.z, half: s.half, yaw: s.yaw };
    team.net = null;
  }

  private letGo(net: Net): void {
    net.mode = 'falling';
    net.t = 0;
    blendGrid(net.pts, net.pts, 0, net.start);
  }

  /** Where a net on the monster drapes: the leap's landing point while it is in the air, else under it. */
  private domeCentre(ctx: WorldContext): { x: number; z: number } {
    const m = ctx.monster;
    return m.airborne && m.leapTo ? m.leapTo : { x: m.position.x, z: m.position.z };
  }

  /** The grid a falling net is headed for: the dome on the monster, or flat on the ground under the squad. */
  private landingGrid(net: Net, ctx: WorldContext, out: P3[]): void {
    if (net.toMonster) {
      const c = this.domeCentre(ctx);
      domeGrid(c.x, 0, c.z, domeRadius(ctx.monster.bodyRadius, ctx.monster.width), ctx.monster.height, out);
    } else groundGrid(net.ground.x, net.ground.z, net.ground.half, net.ground.yaw, out);
  }

  /**
   * Lands a net on the monster: earlier snared nets go, the snare starts (or restarts), and the ground shakes.
   * A monster already dead gets no snare; the net lies flat on the ground where it fell.
   */
  private land(net: Net, ctx: WorldContext): void {
    if (!ctx.monster.alive) {
      const c = this.domeCentre(ctx);
      net.toMonster = false;
      net.ground = { x: c.x, z: c.z, half: domeRadius(ctx.monster.bodyRadius, ctx.monster.width) * 0.7, yaw: 0 };
      groundGrid(net.ground.x, net.ground.z, net.ground.half, 0, net.pts);
      net.mode = 'ground';
      net.t = 0;
      return;
    }
    for (const n of this.nets) if (n !== net && n.mode === 'snared') n.mode = 'torn';
    net.mode = 'snared';
    ctx.snareMonster(CONFIG.snare.duration);
    ctx.shake(O.landShake);
    const c = this.domeCentre(ctx);
    ctx.particles.ring('dust', _v.set(c.x, 0, c.z), domeRadius(ctx.monster.bodyRadius, ctx.monster.width), 20);
  }

  /** Advances one net; false once it should be removed. */
  private updateNet(net: Net, dt: number, ctx: WorldContext): boolean {
    if (net.mode === 'torn') return false;
    if (net.mode === 'falling') {
      net.t += dt;
      const k = Math.min(1, net.t / O.dropTime);
      this.landingGrid(net, ctx, this.scratch);
      blendGrid(net.start, this.scratch, k * k, net.pts);
      if (k >= 1) {
        if (net.toMonster) this.land(net, ctx);
        else {
          net.mode = 'ground';
          net.t = 0;
        }
      }
    } else if (net.mode === 'snared') this.landingGrid(net, ctx, net.pts);
    else if (net.mode === 'ground') {
      net.t += dt;
      net.mesh.material.opacity = Math.max(0, Math.min(1, O.groundLife - net.t));
      if (net.t >= O.groundLife) return false;
    }
    this.drawNet(net);
    return true;
  }

  private makeNet(): Net {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NET_SEGMENTS * 6), 3));
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: P.netRope, transparent: true }));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const net: Net = { mode: 'carried', t: 0, toMonster: false, start: newGrid(), pts: newGrid(), ground: { x: 0, z: 0, half: 0, yaw: 0 }, mesh };
    this.nets.push(net);
    return net;
  }

  private drawNet(net: Net): void {
    const attr = net.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    gridSegments(net.pts, attr.array as Float32Array);
    attr.needsUpdate = true;
  }

  private dropNet(net: Net): void {
    this.scene.remove(net.mesh);
    net.mesh.geometry.dispose();
    net.mesh.material.dispose();
  }
}
