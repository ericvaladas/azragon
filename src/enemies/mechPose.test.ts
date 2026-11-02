import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CRAWL_ORDER, HIP_FRAME_D, HIP_FRAME_T, HIP_FRAME_W, MECH_LEGS, MECH_PIVOTS as PV, mechLauncher, mechParts } from './mechModel';
import { MAX_REACH, gaitFoot, gaitLeg, hipOf, legPhase, restPose, solveLeg, targetPose, type FootOffset, type LegAngles, type MechPose, type MechPoseInput } from './mechPose';

const input = (o: Partial<MechPoseInput> = {}): MechPoseInput => ({ stride: 0, gait: 0, action: 'walk', actT: 0, dashing: false, stabLeg: 0, evadeSide: 1, alive: true, dying: 0, wrecked: false, recoil: 0, ...o });

/** Where the IK's angles put the foot: forward kinematics through the leg's yaw, upper turn and knee turn. */
function footFrom(hip: THREE.Vector3, a: LegAngles): THREE.Vector3 {
  const m = new THREE.Matrix4().makeTranslation(hip.x, hip.y, hip.z).multiply(new THREE.Matrix4().makeRotationY(a.yaw)).multiply(new THREE.Matrix4().makeRotationX(a.upper));
  m.multiply(new THREE.Matrix4().makeTranslation(0, PV.kneeY, PV.kneeZ)).multiply(new THREE.Matrix4().makeRotationX(a.knee));
  return new THREE.Vector3(0, PV.footY, PV.footZ).applyMatrix4(m);
}

/** Leg `i`'s knee, posed by the IK. */
function kneeAt(p: MechPose, i: number): THREE.Vector3 {
  const hip = hipOf(i, p, new THREE.Vector3());
  const a = solveLeg(hip, p.feet[i * 3]!, p.feet[i * 3 + 1]!, p.feet[i * 3 + 2]!, MECH_LEGS[i]!.splay, { yaw: 0, upper: 0, knee: 0 });
  const m = new THREE.Matrix4().makeTranslation(hip.x, hip.y, hip.z).multiply(new THREE.Matrix4().makeRotationY(a.yaw)).multiply(new THREE.Matrix4().makeRotationX(a.upper));
  return new THREE.Vector3(0, PV.kneeY, PV.kneeZ).applyMatrix4(m);
}

/** How far leg `i`'s knee rises above its hip. */
const kneeRise = (p: MechPose, i: number) => kneeAt(p, i).y - hipOf(i, p, new THREE.Vector3()).y;

/** Leg `i`'s hip, knee and foot in the body's own frame, `n` samples along each segment. */
function legInBody(p: MechPose, i: number, n = 24): THREE.Vector3[] {
  const rearZ = MECH_LEGS[2]!.z;
  const body = new THREE.Matrix4()
    .makeTranslation(p.sway, PV.bodyY + p.lift, rearZ + p.shift)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.pitch, 0, p.roll)))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -rearZ));
  const inv = body.invert();
  const hip = hipOf(i, p, new THREE.Vector3());
  const knee = kneeAt(p, i);
  const foot = new THREE.Vector3(p.feet[i * 3]!, p.feet[i * 3 + 1]!, p.feet[i * 3 + 2]!);
  const out: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) {
    out.push(hip.clone().lerp(knee, k / n).applyMatrix4(inv));
    out.push(knee.clone().lerp(foot, k / n).applyMatrix4(inv));
  }
  return out;
}

const WINDUPS = (): [string, MechPose][] => {
  const mv = CONFIG.mech.moves;
  return [
    ['stab left', targetPose(input({ action: 'punch', actT: mv.punch.windup * 0.99, stabLeg: 0 }), restPose())],
    ['stab right', targetPose(input({ action: 'punch', actT: mv.punch.windup * 0.99, stabLeg: 1 }), restPose())],
    ['stomp', targetPose(input({ action: 'slam', actT: mv.slam.windup * 0.99 }), restPose())],
    ['rest', restPose()],
    ...Array.from({ length: 16 }, (_, k): [string, MechPose] => ['walk', targetPose(input({ gait: 1, stride: (k / 16) * Math.PI * 2 }), restPose())]),
  ];
};

describe('mech pose', () => {
  it('the rest pose needs no bend: each leg pivots on the hip frame and yaws to its splay', () => {
    const p = restPose();
    const a: LegAngles = { yaw: 0, upper: 0, knee: 0 };
    MECH_LEGS.forEach((leg, i) => {
      // The hip frame is centred on the body pivot's height.
      expect(hipOf(i, p, new THREE.Vector3()).y).toBeCloseTo(PV.bodyY, 9);
      solveLeg(hipOf(i, p, new THREE.Vector3()), p.feet[i * 3]!, p.feet[i * 3 + 1]!, p.feet[i * 3 + 2]!, leg.splay, a);
      expect(a.yaw).toBeCloseTo(leg.splay, 6);
      expect(a.upper).toBeCloseTo(0, 6);
      expect(a.knee).toBeCloseTo(0, 6);
    });
  });

  it('the IK puts the spike on any reachable foot, knee up', () => {
    const hip = new THREE.Vector3(0.15, 0.36, 0.14);
    const a: LegAngles = { yaw: 0, upper: 0, knee: 0 };
    for (const [x, y, z] of [[0.45, 0, 0.4], [0.2, 0.05, 0.75], [0.7, 0.55, 0.3], [0.6, 0, -0.1]] as const) {
      solveLeg(hip, x, y, z, 0.9, a);
      const f = footFrom(hip, a);
      expect(f.distanceTo(new THREE.Vector3(x, y, z))).toBeLessThan(1e-6);
      // The knee is above the line from hip to foot.
      const knee = new THREE.Vector3(0, PV.kneeY, PV.kneeZ).applyMatrix4(new THREE.Matrix4().makeTranslation(hip.x, hip.y, hip.z).multiply(new THREE.Matrix4().makeRotationY(a.yaw)).multiply(new THREE.Matrix4().makeRotationX(a.upper)));
      const t = Math.hypot(knee.x - hip.x, knee.z - hip.z) / Math.hypot(x - hip.x, z - hip.z);
      expect(knee.y).toBeGreaterThan(hip.y + (y - hip.y) * t);
    }
  });

  it('the wind-ups lift the blades well above their old heights while the knees stay apart', () => {
    for (const [name, p] of WINDUPS()) {
      if (name === 'stab left') {
        expect(p.feet[1]).toBeGreaterThan(0.18 + 0.08);
        expect(kneeRise(p, 0)).toBeLessThan(0.15);
      } else if (name === 'stab right') {
        expect(p.feet[4]).toBeGreaterThan(0.18 + 0.08);
        expect(kneeRise(p, 1)).toBeLessThan(0.15);
      } else if (name === 'stomp') {
        expect(p.feet[1]).toBeGreaterThan(0.24 + 0.08);
        expect(p.feet[4]).toBeGreaterThan(0.24 + 0.08);
      }
      expect(kneeAt(p, 0).x - kneeAt(p, 1).x).toBeGreaterThan(0.5);
    }
  });

  describe('crawl gait', () => {
    const G = CONFIG.mech;
    const TAU = Math.PI * 2;
    const SAMPLES = 480;
    const off = (): FootOffset => ({ z: 0, y: 0 });
    /** Stride angles over one full cycle. */
    const cycle = () => Array.from({ length: SAMPLES }, (_, k) => ((k + 0.5) / SAMPLES) * TAU);
    const lifted = (p: MechPose) => [0, 1, 2, 3].filter((i) => p.feet[i * 3 + 1]! > 1e-9);

    it('the crawl goes rear-left, front-left, rear-right, front-right', () => {
      const name = CRAWL_ORDER.map((i) => (MECH_LEGS[i]!.z > 0 ? 'front' : 'rear') + (MECH_LEGS[i]!.x > 0 ? '-left' : '-right'));
      expect(name).toEqual(['rear-left', 'front-left', 'rear-right', 'front-right']);
    });

    it('a planted foot moves back at exactly the body speed: a linear ramp over the planted part of the cycle', () => {
      const a = gaitFoot(0.1, off());
      const b = gaitFoot(0.6, off());
      expect((b.z - a.z) / 0.5).toBeCloseTo(-G.gaitStep, 9);
      expect(a.y).toBe(0);
      expect(b.y).toBe(0);
    });

    it('a swinging foot lifts on a continuous path and meets the ground moving at the planted speed', () => {
      let last = gaitFoot(0, off());
      const eps = 1e-5;
      for (let k = 1; k <= 2000; k++) {
        const f = gaitFoot((k % 2000) / 2000, off());
        expect(Math.abs(f.z - last.z)).toBeLessThan(0.002);
        expect(Math.abs(f.y - last.y)).toBeLessThan(0.002);
        last = f;
      }
      const speed = (gaitFoot(1 - eps, off()).z - gaitFoot(1 - 3 * eps, off()).z) / (2 * eps);
      expect(speed).toBeCloseTo(-G.gaitStep, 2);
      expect(gaitFoot(G.gaitDuty + (1 - G.gaitDuty) / 2, off()).y).toBeCloseTo(G.gaitLift, 9);
    });

    it('at full gait exactly one foot is lifted at a time and at least three are planted', () => {
      for (const stride of cycle()) {
        const p = targetPose(input({ gait: 1, stride }), restPose());
        expect(lifted(p).length).toBe(1);
      }
    });

    it('each leg lifts in crawl order, for a quarter of the cycle', () => {
      const order: number[] = [];
      const counts = [0, 0, 0, 0];
      for (const stride of cycle()) {
        const i = lifted(targetPose(input({ gait: 1, stride }), restPose()))[0]!;
        counts[i]!++;
        if (order[order.length - 1] !== i) order.push(i);
      }
      // Stride 0 is the rear-left foot planting. Each leg swings in the quarter before its plant.
      expect(order).toEqual([CRAWL_ORDER[1], CRAWL_ORDER[2], CRAWL_ORDER[3], CRAWL_ORDER[0]]);
      for (const n of counts) expect(n / SAMPLES).toBeCloseTo(1 - G.gaitDuty, 2);
    });

    it('legPhase reaches 0, a plant, on the quarter of the cycle matching the crawl order', () => {
      CRAWL_ORDER.forEach((leg, k) => {
        const stride = (k / 4) * TAU + 4 * TAU;
        expect(legPhase(leg, stride + 1e-6)).toBeLessThan(1e-5);
      });
    });

    it('every foot target stays inside the IK reach, with margin, at any gait', () => {
      const hip = new THREE.Vector3();
      for (const gait of [0, 0.2, 0.5, 0.8, 1]) {
        for (const stride of cycle()) {
          const p = targetPose(input({ gait, stride }), restPose());
          for (let i = 0; i < 4; i++) {
            hipOf(i, p, hip);
            expect(hip.distanceTo(new THREE.Vector3(p.feet[i * 3]!, p.feet[i * 3 + 1]!, p.feet[i * 3 + 2]!))).toBeLessThan(MAX_REACH - 0.003);
          }
        }
      }
    });

    it('the hull leans and shifts away from the swinging side, smoothly and subtly', () => {
      let last = targetPose(input({ gait: 1, stride: 0 }), restPose());
      expect(last.sway).toBeLessThan(0);
      expect(last.roll).toBeGreaterThan(0);
      for (const stride of cycle()) {
        const p = targetPose(input({ gait: 1, stride }), restPose());
        const i = lifted(p)[0]!;
        const left = MECH_LEGS[i]!.x > 0;
        // Each side's swings run for half the cycle; the hull is on the far side throughout.
        const side = Math.cos(stride);
        if (Math.abs(side) > 1e-3) {
          expect(left).toBe(side > 0);
          expect(Math.sign(p.sway)).toBe(left ? -1 : 1);
          expect(Math.sign(p.roll)).toBe(left ? 1 : -1);
        }
        expect(Math.abs(p.sway)).toBeLessThanOrEqual(0.02);
        expect(Math.abs(p.roll)).toBeLessThanOrEqual(0.03);
        expect(Math.abs(p.sway - last.sway)).toBeLessThan(0.001);
        expect(Math.abs(p.roll - last.roll)).toBeLessThan(0.001);
        last = p;
      }
    });

    it('the hull is at its lowest as a foot plants', () => {
      const plant = targetPose(input({ gait: 1, stride: Math.PI / 2 }), restPose());
      const mid = targetPose(input({ gait: 1, stride: Math.PI / 2 + Math.PI / 4 }), restPose());
      expect(plant.lift).toBeCloseTo(-G.gaitBob, 9);
      expect(mid.lift).toBeCloseTo(G.gaitBob, 9);
    });

    it('settling to rest moves each foot to its spot only while lifted, one leg at a time', () => {
      const leg = off();
      const prev = off();
      for (const stride of cycle().filter((_, k) => k % 8 === 0)) {
        let moving = 0;
        for (let gait = 1; gait > 0; gait -= 0.005) {
          let now = 0;
          for (let i = 0; i < 4; i++) {
            gaitLeg(i, stride, gait, leg);
            gaitLeg(i, stride, gait - 0.005, prev);
            const shift = Math.abs(leg.z - prev.z);
            if (shift > 1e-6) {
              now++;
              // A foot only travels clear of the ground, the first and last moments of its hop aside.
              if (shift > 2e-4) expect(Math.max(leg.y, prev.y)).toBeGreaterThan(0);
            }
          }
          moving = Math.max(moving, now);
        }
        expect(moving).toBeLessThanOrEqual(2);
      }
      for (const i of [0, 1, 2, 3]) {
        gaitLeg(i, 1.3, 0, leg);
        expect(leg.z).toBeCloseTo(0, 12);
        expect(leg.y).toBeCloseTo(0, 12);
      }
    });

    it('the dash still gallops on diagonal pairs', () => {
      const p = targetPose(input({ action: 'dash', actT: CONFIG.mech.moves.dash.windup, dashing: true, stride: 0 }), restPose());
      expect(p.feet[1]).toBeGreaterThan(0);
      expect(p.feet[10]).toBeGreaterThan(0);
      expect(p.feet[4]).toBeCloseTo(0, 6);
      expect(p.feet[7]).toBeCloseTo(0, 6);
    });
  });

  it('no leg passes through the hull, the launcher or the hip frame', () => {
    const parts = mechParts();
    const box = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
    const hull = box(parts.hull).expandByScalar(0.06);
    const launcher = box(mechLauncher()).expandByScalar(0.08);
    // The margins are a leg's half section. Outside the drum at the hip, the leg stays clear of the frame plate.
    const frame = new THREE.Box3(new THREE.Vector3(-HIP_FRAME_W / 2, -HIP_FRAME_T / 2, -HIP_FRAME_D / 2), new THREE.Vector3(HIP_FRAME_W / 2, HIP_FRAME_T / 2, HIP_FRAME_D / 2));
    for (const [, p] of WINDUPS()) {
      for (let i = 0; i < 4; i++) {
        const hip = new THREE.Vector3(MECH_LEGS[i]!.x, 0, MECH_LEGS[i]!.z);
        for (const q of legInBody(p, i)) {
          const local = q.clone().setY(q.y - PV.bodyY);
          expect(hull.containsPoint(local)).toBe(false);
          expect(launcher.containsPoint(local)).toBe(false);
          if (local.distanceTo(hip) > 0.12) expect(frame.containsPoint(local)).toBe(false);
        }
      }
    }
  });

  it('the stab rears a front leg up in the wind-up, then spikes it forward', () => {
    const mv = CONFIG.mech.moves.punch;
    const up = targetPose(input({ action: 'punch', actT: mv.windup * 0.99, stabLeg: 1 }), restPose());
    expect(up.feet[4]).toBeGreaterThan(0.26);
    expect(up.pitch).toBeLessThan(0);
    expect(kneeRise(up, 1)).toBeLessThan(0.15);
    const out = targetPose(input({ action: 'punch', actT: mv.windup + 0.01, stabLeg: 1 }), restPose());
    const rest = restPose();
    expect(out.feet[5]).toBeGreaterThan(rest.feet[5]! + 0.2);
    // The other front leg stays planted.
    expect(out.feet[1]).toBeCloseTo(0, 6);
  });

  it('the stomp rears up with both front legs high; the dash wind-up crouches; the wreck splays flat', () => {
    const slam = targetPose(input({ action: 'slam', actT: CONFIG.mech.moves.slam.windup * 0.99 }), restPose());
    expect(slam.feet[1]).toBeGreaterThan(0.32);
    expect(slam.feet[4]).toBeGreaterThan(0.32);
    // The front knees stay low, and far apart.
    expect(kneeRise(slam, 0)).toBeLessThan(0.15);
    expect(kneeRise(slam, 1)).toBeLessThan(0.15);
    expect(kneeAt(slam, 0).x - kneeAt(slam, 1).x).toBeGreaterThan(0.5);
    expect(slam.feet[7]).toBeCloseTo(0, 6);
    expect(slam.feet[10]).toBeCloseTo(0, 6);
    const crouch = targetPose(input({ action: 'dash', actT: CONFIG.mech.moves.dash.windup * 0.99 }), restPose());
    expect(crouch.lift).toBeLessThan(-0.1);
    const wreck = targetPose(input({ alive: false, wrecked: true }), restPose());
    const rest = restPose();
    expect(wreck.lift).toBeLessThan(-0.2);
    for (let i = 0; i < 4; i++) expect(Math.abs(wreck.feet[i * 3]!)).toBeGreaterThan(Math.abs(rest.feet[i * 3]!));
  });
});
