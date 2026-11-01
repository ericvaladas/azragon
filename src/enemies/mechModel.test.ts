import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LEG_REACH, LOWER_LEN, MECH_LEGS, MECH_PIVOTS, mechParts, type MechLeg, type MechParts } from './mechModel';

const P = MECH_PIVOTS;
const bounds = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);

/** A body part (its origin at the body pivot) as it stands. */
const placedBody = (g: THREE.BufferGeometry) => bounds(g).translate(new THREE.Vector3(0, P.bodyY, 0));

/** One leg's upper and lower segments as they stand at rest: yawed by the leg's splay, at its hip and knee. */
function placedLeg(parts: MechParts, leg: MechLeg): { upper: THREE.Box3; lower: THREE.Box3 } {
  const yaw = new THREE.Matrix4().makeRotationY(leg.splay);
  const hip = new THREE.Matrix4().makeTranslation(leg.x, P.bodyY, leg.z).multiply(yaw);
  const knee = hip.clone().multiply(new THREE.Matrix4().makeTranslation(0, P.kneeY, P.kneeZ));
  return {
    upper: bounds(parts.legUpper.clone().applyMatrix4(hip)),
    lower: bounds(parts.legLower.clone().applyMatrix4(knee)),
  };
}

function wholeMech(parts: MechParts): THREE.Box3 {
  const all = new THREE.Box3();
  for (const name of ['hull', 'turret', 'visor', 'cannons', 'glow'] as const) all.union(placedBody(parts[name]));
  for (const leg of MECH_LEGS) {
    const l = placedLeg(parts, leg);
    all.union(l.upper).union(l.lower);
  }
  return all;
}

describe('mech model', () => {
  it('stands one unit tall on the ground and about 0.9 wide', () => {
    const all = wholeMech(mechParts());
    expect(all.min.y).toBeCloseTo(0, 2);
    expect(all.max.y).toBeGreaterThan(0.98);
    expect(all.max.y).toBeLessThan(1.02);
    // Its splayed legs span about 0.9 of its height across (CONFIG.mech.width).
    expect(all.max.x - all.min.x).toBeGreaterThan(0.7);
    expect(all.max.x - all.min.x).toBeLessThan(1);
  });

  it('the four spike feet stand on the ground at the corners', () => {
    const parts = mechParts();
    const feet = MECH_LEGS.map((leg) => placedLeg(parts, leg).lower);
    for (const f of feet) expect(f.min.y).toBeCloseTo(0, 3);
    // Each foot is out past the hull, at its corner: front-left, front-right, rear-left, rear-right (+X is the left).
    const centre = (b: THREE.Box3) => b.getCenter(new THREE.Vector3());
    const [fl, fr, rl, rr] = feet.map(centre) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
    expect(fl.x).toBeGreaterThan(0.25);
    expect(rl.x).toBeGreaterThan(0.25);
    expect(fr.x).toBeLessThan(-0.25);
    expect(rr.x).toBeLessThan(-0.25);
    expect(fl.z).toBeGreaterThan(0.2);
    expect(fr.z).toBeGreaterThan(0.2);
    expect(rl.z).toBeLessThan(-0.2);
    expect(rr.z).toBeLessThan(-0.2);
    // The rest foot sits LEG_REACH out from its hip along the splay.
    MECH_LEGS.forEach((leg, i) => {
      const tipX = leg.x + Math.sin(leg.splay) * LEG_REACH;
      const tipZ = leg.z + Math.cos(leg.splay) * LEG_REACH;
      expect(feet[i]!.min.x).toBeLessThanOrEqual(tipX + 1e-6);
      expect(feet[i]!.max.x).toBeGreaterThanOrEqual(tipX - 1e-6);
      expect(feet[i]!.min.z).toBeLessThanOrEqual(tipZ + 1e-6);
      expect(feet[i]!.max.z).toBeGreaterThanOrEqual(tipZ - 1e-6);
    });
  });

  it('the knees sit about level with the hips, the launcher is on the left and the cannons on the right, aimed forward', () => {
    const parts = mechParts();
    const hull = placedBody(parts.hull);
    // A shallow bend: the upper leg runs out about level with the hip, under the hull top, and the lower leg stays short.
    for (const leg of MECH_LEGS) expect(placedLeg(parts, leg).upper.max.y).toBeLessThan(P.bodyY + 0.12);
    expect(LOWER_LEN).toBeLessThan(0.6);
    const cannons = placedBody(parts.cannons);
    expect(cannons.max.x).toBeLessThan(0);
    expect(cannons.max.z).toBeCloseTo(P.muzzleZ, 3);
    expect(cannons.max.z).toBeGreaterThan(hull.max.z);
    const turret = placedBody(parts.turret);
    expect(turret.max.x).toBeGreaterThan(0.18);
    expect(turret.max.y).toBeCloseTo(P.bodyY + P.launcherY, 3);
  });

  it('every part has a color attribute', () => {
    const parts = mechParts();
    for (const g of Object.values(parts)) {
      const c = g.getAttribute('color');
      expect(c).toBeDefined();
      expect(c.count).toBe(g.getAttribute('position').count);
    }
  });
});
