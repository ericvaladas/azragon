type P3 = { x: number; y: number; z: number };

/** Up to `max` items within a 3D `radius` of `center`, nearest first. */
export function nearestWithin<T>(center: P3, radius: number, items: readonly T[], max: number, pos: (t: T) => P3): T[] {
  if (max <= 0) return [];
  const r2 = radius * radius;
  const scored: { t: T; d: number }[] = [];
  for (const t of items) {
    const p = pos(t);
    const d = (p.x - center.x) ** 2 + (p.y - center.y) ** 2 + (p.z - center.z) ** 2;
    if (d <= r2) scored.push({ t, d });
  }
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, max).map((s) => s.t);
}

/** Acid Mortar priority: the threats that are hardest to reach on foot come first. */
const PRIORITY: Record<string, number> = { artillery: 0, gustav: 0.5, sam: 1, truck: 2, tank: 3 };

type GroundTarget = { kind: string; position: P3; airborne: boolean; isAlive(): boolean };

/** Up to n distinct live ground targets within `range` (horizontal), by priority then distance. */
export function mortarTargets<T extends GroundTarget>(from: P3, range: number, targets: readonly T[], n: number): T[] {
  return targets
    .filter((t) => !t.airborne && t.isAlive() && t.kind in PRIORITY && Math.hypot(t.position.x - from.x, t.position.z - from.z) <= range)
    .map((t) => ({ t, pr: PRIORITY[t.kind]!, d: Math.hypot(t.position.x - from.x, t.position.z - from.z) }))
    .sort((a, b) => a.pr - b.pr || a.d - b.d)
    .slice(0, n)
    .map((s) => s.t);
}
