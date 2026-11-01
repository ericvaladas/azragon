import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { HIP_FRAME_D, HIP_FRAME_T, HIP_FRAME_W, MECH_LEGS, MECH_PIVOTS as PV, mechLauncher, mechParts } from './mechModel';
import { hipOf, restPose, solveLeg, targetPose, type LegAngles, type MechPose, type MechPoseInput } from './mechPose';

const input = (o: Partial<MechPoseInput> = {}): MechPoseInput => ({ stride: 0, gait: 0, action: 'walk', actT: 0, dashing: false, stabLeg: 0, alive: true, dying: 0, wrecked: false, recoil: 0, ...o });

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
    .makeTranslation(0, PV.bodyY + p.lift, rearZ + p.shift)
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
    ['walk', targetPose(input({ gait: 1, stride: 0.6 }), restPose())],
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

  it('walking, diagonal pairs step together and the planted pair stays on the ground', () => {
    const p = targetPose(input({ stride: Math.PI / 2 + 0.3, gait: 1 }), restPose());
    // Front-left and rear-right are mid-plant (on the ground); front-right and rear-left swing (lifted).
    expect(p.feet[1]).toBeCloseTo(0, 6);
    expect(p.feet[10]).toBeCloseTo(0, 6);
    expect(p.feet[4]).toBeGreaterThan(0);
    expect(p.feet[7]).toBeGreaterThan(0);
  });

  it('no leg passes through the hull, the launcher or the hip frame', () => {
    const parts = mechParts();
    const box = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
    const hull = box(parts.hull).expandByScalar(0.02);
    const launcher = box(mechLauncher()).expandByScalar(0.03);
    // Outside the drum at the hip, the leg stays clear of the frame plate.
    const frame = new THREE.Box3(new THREE.Vector3(-HIP_FRAME_W / 2, -HIP_FRAME_T / 2, -HIP_FRAME_D / 2), new THREE.Vector3(HIP_FRAME_W / 2, HIP_FRAME_T / 2, HIP_FRAME_D / 2));
    for (const [, p] of WINDUPS()) {
      for (let i = 0; i < 4; i++) {
        const hip = new THREE.Vector3(MECH_LEGS[i]!.x, 0, MECH_LEGS[i]!.z);
        for (const q of legInBody(p, i)) {
          const local = q.clone().setY(q.y - PV.bodyY);
          expect(hull.containsPoint(local)).toBe(false);
          expect(launcher.containsPoint(local)).toBe(false);
          if (local.distanceTo(hip) > 0.08) expect(frame.containsPoint(local)).toBe(false);
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
