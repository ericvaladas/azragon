import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Monster } from './Monster';
import type { BodyFrame, MonsterBody, MonsterKind } from '../monsters/types';
import { INSECT } from '../monsters/insect/kind';
import { CONFIG } from '../config';
import { STRIKE_TIMES } from './strike';
import { SWAT_TIMES, swatTiming } from './tailSwat';

function stubBody(): MonsterBody & { frames: number; last: BodyFrame | null } {
  const root = new THREE.Group();
  return {
    root,
    frames: 0,
    last: null,
    animate(f: BodyFrame) {
      this.frames++;
      this.last = f;
    },
    rangedOrigin: (out) => out.set(1, 2, 3),
    aimError: () => 0,
    launchOrigin: (out) => out.set(4, 5, 6),
    dispose() {},
  };
}

function kind(over: Partial<MonsterKind['stats']> = {}): MonsterKind {
  return { ...INSECT, stats: { ...INSECT.stats, ...over }, createBody: () => stubBody() };
}

describe('Monster', () => {
  it('reports each ranged attack it spends, and nothing while the ranged attack is only ready', () => {
    const m = new Monster(new THREE.Scene(), kind({ rangedCooldown: 3 }));
    let spent = 0;
    m.onRangedSpent = () => spent++;
    expect(m.rangedReady()).toBe(true);
    m.tick(1);
    expect(spent).toBe(0);
    m.consumeRanged(1);
    expect(spent).toBe(1);
  });

  it('a long roar holds busy for its duration', () => {
    const m = new Monster(new THREE.Scene(), kind());
    m.startRoar(4);
    m.tick(3.5);
    expect(m.busy).toBe(true);
    m.tick(0.6);
    expect(m.busy).toBe(false);
  });

  it('takes HP, speed, and cooldowns from its kind', () => {
    const m = new Monster(new THREE.Scene(), kind({ maxHp: 777, moveSpeed: 100, meleeCooldown: 2, rangedCooldown: 3 }));
    expect(m.hp).toBe(777);
    expect(m.maxHp).toBe(777);
    m.yaw = 0;
    for (let i = 0; i < 10; i++) m.moveToward({ x: 0, z: 5000 }, 0.1, 1);
    expect(m.position.z).toBeCloseTo(100, 0);
    m.startMelee(1, 0, { x: 0, z: 200 });
    for (let i = 0; i < 19; i++) m.tick(0.1);
    expect(m.meleeReady()).toBe(false);
    m.tick(0.11);
    expect(m.meleeReady()).toBe(true);
    m.consumeRanged(1);
    m.tick(2.9);
    expect(m.rangedReady()).toBe(false);
    m.tick(0.11);
    expect(m.rangedReady()).toBe(true);
  });

  it('fires the melee impact at the kind\'s impact time, at the strike point', () => {
    const m = new Monster(new THREE.Scene(), kind({ meleeTiming: { windup: 0.2, impact: 0.5, end: 0.9 } }));
    const hits: THREE.Vector3[] = [];
    m.onMeleeImpact = (p) => hits.push(p);
    m.startMelee(1, 1, { x: 30, z: 40 });
    m.tick(0.45);
    expect(hits).toHaveLength(0);
    m.tick(0.1);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.x).toBe(30);
    expect(hits[0]!.z).toBe(40);
  });

  it('swaps bodies with setKind: old root leaves the scene, the new one joins, stats reset', () => {
    const scene = new THREE.Scene();
    const m = new Monster(scene, kind({ maxHp: 500 }));
    const oldRoot = m.body.root;
    m.visible = false;
    m.hp = 10;
    m.setKind(kind({ maxHp: 900 }));
    expect(oldRoot.parent).toBeNull();
    expect(m.body.root.parent).toBe(scene);
    expect(m.hp).toBe(900);
    expect(m.visible).toBe(false);
  });

  it('delegates the ranged origin and passes the frame to its body', () => {
    const m = new Monster(new THREE.Scene(), kind());
    expect(m.rangedOrigin(new THREE.Vector3()).toArray()).toEqual([1, 2, 3]);
    m.animate(0.016, 0);
    expect((m.body as ReturnType<typeof stubBody>).frames).toBe(1);
  });
});

describe('Monster tail sweep', () => {
  it('runs its own timeline: impact once at the impact time, free again after the end, walking unaffected', () => {
    const m = new Monster(new THREE.Scene(), kind());
    let hits = 0;
    m.onTailImpact = () => hits++;
    m.startTailSweep(1, { windup: 0.2, impact: 0.4, end: 0.8 });
    expect(m.tailSweeping).toBe(true);
    expect(m.busy).toBe(false);
    m.tick(0.35);
    expect(hits).toBe(0);
    m.tick(0.1);
    expect(hits).toBe(1);
    m.tick(0.2);
    expect(hits).toBe(1);
    m.tick(0.2);
    expect(m.tailSweeping).toBe(false);
  });
  it('delegates the launch origin to its body', () => {
    const m = new Monster(new THREE.Scene(), kind());
    expect(m.launchOrigin(new THREE.Vector3()).toArray()).toEqual([4, 5, 6]);
  });
});

describe('Monster frame flags', () => {
  it('tells the body when it is airborne (Leap) or dashing', () => {
    const m = new Monster(new THREE.Scene(), kind());
    const body = m.body as ReturnType<typeof stubBody>;
    m.animate(0.016, 0);
    expect(body.last!.airborne).toBe(false);
    expect(body.last!.dashing).toBe(false);
    m.startLeap({ x: 0, z: 500 });
    m.animate(0.016, 0);
    // Still crouched on the ground until the crouch is over, then off it.
    expect(body.last!.airborne).toBe(false);
    m.tick(CONFIG.abilities.leap.duration * ((m.kind.leapCrouch ?? 0) + 0.05));
    m.animate(0.016, 0);
    expect(body.last!.airborne).toBe(true);
    m.reset();
    m.startDash({ x: 0, z: 500 });
    m.animate(0.016, 0);
    expect(body.last!.dashing).toBe(true);
  });
});

describe('Monster.mouthOrigin', () => {
  it("is the body's mouth when it has one, else where its ranged attacks leave from", () => {
    const k = kind();
    const withMouth = new Monster(new THREE.Scene(), { ...k, createBody: () => ({ ...stubBody(), sprayFrom: (out: THREE.Vector3) => out.set(1, 2, 3), rangedOrigin: (out: THREE.Vector3) => out.set(9, 9, 9) }) });
    expect(withMouth.mouthOrigin(new THREE.Vector3()).toArray()).toEqual([1, 2, 3]);
    const without = new Monster(new THREE.Scene(), { ...k, createBody: () => ({ ...stubBody(), rangedOrigin: (out: THREE.Vector3) => out.set(9, 9, 9) }) });
    expect(without.mouthOrigin(new THREE.Vector3()).toArray()).toEqual([9, 9, 9]);
  });
});

describe('Monster.hold', () => {
  it('an ultimate taking hold cancels a strike already in progress: it never lands', () => {
    const m = new Monster(new THREE.Scene(), kind());
    let hits = 0;
    m.onMeleeImpact = () => hits++;
    m.startMelee(1, 0, { x: 0, z: 200 });
    m.tick(0.05);
    m.hold(0);
    for (let i = 0; i < 60; i++) m.tick(1 / 60);
    expect(hits).toBe(0);
  });

  it("an ultimate's roar is passed to the body and leans it back by that much; none once set down", () => {
    const k = kind();
    const seen: number[] = [];
    const m = new Monster(new THREE.Scene(), { ...k, createBody: () => ({ ...stubBody(), animate: (f) => seen.push(f.roar) }) });
    m.hold(0, 0, 0, 0.6);
    m.tick(0.016);
    m.animate(0.016, 0);
    expect(m.pose.pitch).toBeCloseTo(-0.45 * 0.6);
    m.hold(null);
    m.tick(0.016);
    m.animate(0.016, 0);
    expect(seen).toEqual([0.6, 0]);
  });

  it("passes the hold's blaze to the body, and none once set down", () => {
    const k = kind();
    const seen: number[] = [];
    const m = new Monster(new THREE.Scene(), { ...k, createBody: () => ({ ...stubBody(), animate: (f) => seen.push(f.blaze) }) });
    m.hold(0, 0, 0.8);
    m.animate(0.016, 0);
    m.hold(null);
    m.animate(0.016, 0);
    expect(seen).toEqual([0.8, 0]);
  });

  it("passes the hold's brace to the body, and none once set down", () => {
    const k = kind();
    const seen: { carried: boolean; brace: number }[] = [];
    const m = new Monster(new THREE.Scene(), { ...k, createBody: () => ({ ...stubBody(), animate: (f) => seen.push({ carried: f.carried, brace: f.brace }) }) });
    m.hold(0, 0.7);
    m.animate(0.016, 0);
    m.hold(null);
    m.animate(0.016, 0);
    expect(seen).toEqual([{ carried: true, brace: 0.7 }, { carried: false, brace: 0 }]);
  });

  it('a held monster stays where it is put, busy and airborne off the ground, then lands', () => {
    const k = kind();
    const m = new Monster(new THREE.Scene(), { ...k, createBody: () => ({ ...stubBody(), animate: (_f, land) => land(new THREE.Vector3()) }) });
    let landed = 0;
    m.onFootLand = () => landed++;
    m.position.set(100, 0, 200);
    m.hold(0);
    m.tick(0.016);
    expect(m.busy).toBe(true);
    expect(m.airborne).toBe(false);
    m.hold(450);
    m.tick(0.016);
    m.animate(0.016, 0);
    expect(m.position.toArray()).toEqual([100, 450, 200]);
    expect(m.busy).toBe(true);
    expect(m.airborne).toBe(true);
    expect(landed).toBe(0);
    m.hold(null);
    m.tick(0.016);
    m.animate(0.016, 0);
    expect(m.position.y).toBe(0);
    expect(m.busy).toBe(false);
    expect(m.airborne).toBe(false);
    expect(landed).toBe(1);
  });
});

describe('INSECT kind', () => {
  it('keeps the Insect Titan\'s milestone-3 numbers', () => {
    const M = CONFIG.monster;
    const s = INSECT.stats;
    expect([s.maxHp, s.moveSpeed, s.turnRate, s.damageMult]).toEqual([M.maxHp, M.moveSpeed, M.turnRate, 1]);
    expect([s.footRadius, s.footDamage, s.bodyRadius, s.strideLength]).toEqual([M.footRadius, M.footDamage, M.bodyRadius, M.strideLength]);
    expect([s.meleeRange, s.meleeRadius, s.meleeDamage, s.meleeCooldown]).toEqual([M.meleeRange, M.meleeRadius, M.meleeDamage, M.meleeCooldown]);
    expect(s.meleeTiming).toEqual({ windup: M.meleeWindup, impact: M.meleeWindup + STRIKE_TIMES.strike, end: M.meleeWindup + STRIKE_TIMES.recover });
    expect([s.rangedRange, s.rangedDamage, s.rangedCooldown]).toEqual([M.spikeRange, M.spikeDamage, M.spikeCooldown]);
    expect(s.headHeight).toBe(CONFIG.passives.swat.headHeight);
    expect([INSECT.melee.kind, INSECT.ranged, INSECT.antiAir]).toEqual(['point', 'spikes', 'tail']);
  });

  it('times its anti-air strike by its kind (the shared timeline unless the kind has its own)', () => {
    const impactAt = (k: MonsterKind) => {
      const m = new Monster(new THREE.Scene(), k);
      let hit = -1;
      let t = 0;
      m.onSwatImpact = () => { hit = t; };
      m.startSwat(new THREE.Vector3(0, 300, 300));
      for (let i = 0; i < 200 && m.swatting; i++) { m.tick(0.01); t += 0.01; }
      return { hit, end: t };
    };
    const shared = impactAt(kind());
    expect(shared.hit).toBeCloseTo(SWAT_TIMES.impact, 1);
    expect(shared.end).toBeCloseTo(SWAT_TIMES.total, 1);
    const own = swatTiming(0.2, 0.1, 0.1, 0.4);
    const slow = impactAt({ ...kind(), swatTiming: own });
    expect(slow.hit).toBeCloseTo(own.impact, 1);
    expect(slow.end).toBeCloseTo(own.total, 1);
  });

  it('times a melee strike by its kind, unless the strike brings its own timeline (the Wendigo backhand)', () => {
    const impactAt = (timing?: { windup: number; impact: number; end: number }) => {
      const m = new Monster(new THREE.Scene(), kind());
      let hit = -1;
      let t = 0;
      m.onMeleeImpact = () => { hit = t; };
      m.startMelee(1, 0, { x: 0, z: 200 }, timing);
      let end = -1;
      for (let i = 0; i < 300; i++) {
        m.tick(0.01);
        t += 0.01;
        if (end < 0 && (m as unknown as { meleeT: number }).meleeT < 0) end = t;
      }
      return { hit, end };
    };
    const T = INSECT.stats.meleeTiming;
    const own = impactAt();
    expect(own.hit).toBeCloseTo(T.impact, 1);
    expect(own.end).toBeCloseTo(T.end, 1);
    const slow = impactAt({ windup: 0.4, impact: 0.6, end: 1.2 });
    expect(slow.hit).toBeCloseTo(0.6, 1);
    expect(slow.end).toBeCloseTo(1.2, 1);
  });
  it('leaves the Insect, Kaiju and Kraken melee timelines as they were', () => {
    expect(INSECT.stats.meleeTiming).toEqual({ windup: 0.3, impact: 0.3 + STRIKE_TIMES.strike, end: 0.3 + STRIKE_TIMES.recover });
    expect(CONFIG.kaiju.stats.meleeTiming).toEqual({ windup: 0.25, impact: 0.4, end: 0.8 });
    expect(CONFIG.kraken.stats.meleeTiming).toEqual({ windup: 0.3, impact: 0.45, end: 0.85 });
  });

  it('crouches on the ground before a leap when its kind asks, still landing on time and on the spot', () => {
    const L = CONFIG.abilities.leap;
    const m = new Monster(new THREE.Scene(), { ...kind(), leapCrouch: 0.2 });
    let landed = -1;
    let t = 0;
    m.onLeapLand = () => { landed = t; };
    m.startLeap({ x: 0, z: 800 });
    for (let i = 0; i < 25; i++) { m.tick(0.01); t += 0.01; }
    expect(m.airborne).toBe(false);
    expect(m.position.y).toBe(0);
    expect(m.position.z).toBeCloseTo(0);
    for (let i = 0; i < 300 && landed < 0; i++) { m.tick(0.01); t += 0.01; if (t > 0.35 && t < 0.4) expect(m.airborne).toBe(true); }
    expect(landed).toBeCloseTo(L.duration, 1);
    expect(m.position.z).toBeCloseTo(800);
  });
  it('can be drawn as a black silhouette (the intro reveal), on every material of its body, also after a change of kind', () => {
    const uSil = (m: Monster) => {
      let mat: THREE.Material | undefined;
      m['body'].root.traverse((o) => { if (!mat && (o as THREE.Mesh).isMesh) mat = (o as THREE.Mesh).material as THREE.Material; });
      const sh = { vertexShader: '', fragmentShader: '#include <fog_fragment>', uniforms: {} as Record<string, THREE.IUniform> };
      mat!.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
      return sh.uniforms['uSilhouette']!;
    };
    const meshy = (): MonsterKind => ({ ...kind(), createBody: () => {
      const b = stubBody();
      b.root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshToonMaterial()));
      return b;
    } });
    const m = new Monster(new THREE.Scene(), meshy());
    m.setSilhouette(1);
    expect(uSil(m).value).toBe(1);
    m.setKind(meshy());
    m.setSilhouette(0.4);
    expect(uSil(m).value).toBe(0.4);
  });
  it('leaps lower over a short distance than a long one', () => {
    const L = CONFIG.abilities.leap;
    const top = (dist: number) => {
      const m = new Monster(new THREE.Scene(), kind());
      m.startLeap({ x: 0, z: dist });
      let y = 0;
      for (let i = 0; i < 300; i++) { m.tick(0.01); y = Math.max(y, m.position.y); }
      return y;
    };
    expect(top(L.range)).toBeCloseTo(L.peak, -1);
    expect(top(L.range / 2)).toBeCloseTo(L.peak / 2, -1);
    expect(top(L.range / 4)).toBeLessThan(L.peak / 3);
  });
  const dashTime = (m: Monster, to: number, speedMult?: number) => {
    m.startDash({ x: 0, z: to }, speedMult);
    let t = 0;
    while (m.dashing && t < 10) { m.tick(0.001); t += 0.001; }
    return t;
  };
  it('dashes at dashMult × its walk speed, the whole way', () => {
    const D = CONFIG.abilities.dash;
    const m = new Monster(new THREE.Scene(), kind());
    const t = dashTime(m, D.range);
    expect(t).toBeCloseTo(D.range / (m.kind.stats.moveSpeed * D.speedMult), 2);
    expect(m.position.z).toBeCloseTo(D.range);
  });
  it('dashes faster with the Move Speed upgrade, and a slower walker dashes slower', () => {
    const D = CONFIG.abilities.dash;
    const base = dashTime(new Monster(new THREE.Scene(), kind()), D.range);
    expect(dashTime(new Monster(new THREE.Scene(), kind()), D.range, 1.15)).toBeCloseTo(base / 1.15, 2);
    const slow = { ...kind(), stats: { ...kind().stats, moveSpeed: kind().stats.moveSpeed / 2 } };
    expect(dashTime(new Monster(new THREE.Scene(), slow), D.range)).toBeCloseTo(base * 2, 2);
  });
  it('keeps its dash speed on a dash cut short (by the shore): half the distance in half the time', () => {
    const D = CONFIG.abilities.dash;
    const full = dashTime(new Monster(new THREE.Scene(), kind()), D.range);
    expect(dashTime(new Monster(new THREE.Scene(), kind()), D.range / 2)).toBeCloseTo(full / 2, 2);
  });
  it('tells its body where it is in the leap', () => {
    const body = stubBody();
    const m = new Monster(new THREE.Scene(), { ...kind(), leapCrouch: 0.2, createBody: () => body });
    m.startLeap({ x: 0, z: 800 });
    m.tick(0.1);
    m.animate(0.016, 0);
    expect(body.last!.leap).toEqual({ t: expect.closeTo(0.1, 5), duration: CONFIG.abilities.leap.duration, crouch: 0.2 });
  });

  it("tells its body the strike's kind when the strike was started with one (none for kinds that don't use it)", () => {
    const body = stubBody();
    const m = new Monster(new THREE.Scene(), { ...kind(), createBody: () => body });
    m.startMelee(1, 0, { x: 0, z: 200 }, undefined, 'backhand');
    m.tick(0.05);
    m.animate(0.016, 0);
    expect(body.last!.melee!.kind).toBe('backhand');
    const body2 = stubBody();
    const m2 = new Monster(new THREE.Scene(), { ...kind(), createBody: () => body2 });
    m2.startMelee(1, 0, { x: 0, z: 200 });
    m2.tick(0.05);
    m2.animate(0.016, 0);
    expect(body2.last!.melee!.kind).toBeUndefined();
  });

  describe('drive (WASD walking)', () => {
    it('walks forward along its facing at its walk speed (× speedMult)', () => {
      const m = new Monster(new THREE.Scene(), kind({ moveSpeed: 100 }));
      m.drive(1, 0, 1, 1.5);
      expect(m.position.z).toBeCloseTo(150);
      expect(m.position.x).toBeCloseTo(0);
    });
    it('backs up at CONFIG.monster.reverseSpeed of its walk speed, still facing forward', () => {
      const m = new Monster(new THREE.Scene(), kind({ moveSpeed: 100 }));
      m.drive(-1, 0, 1, 1);
      expect(m.position.z).toBeCloseTo(-100 * CONFIG.monster.reverseSpeed);
      expect(m.yaw).toBe(0);
    });
    it('turns left (+yaw, toward +X) and right at its turn rate, standing or walking', () => {
      const m = new Monster(new THREE.Scene(), kind({ turnRate: 2 }));
      m.drive(0, 1, 0.5, 1);
      expect(m.yaw).toBeCloseTo(1);
      expect(m.position.length()).toBe(0);
      m.drive(0, -1, 0.25, 1);
      expect(m.yaw).toBeCloseTo(0.5);
    });
    it('plays the gait backward while backing up', () => {
      const body = stubBody();
      const m = new Monster(new THREE.Scene(), { ...kind(), createBody: () => body });
      m.drive(-1, 0, 0.2, 1);
      m.animate(0.2, 0);
      expect(body.last!.cycle).toBeLessThan(body.last!.prevCycle);
    });
  });
});
