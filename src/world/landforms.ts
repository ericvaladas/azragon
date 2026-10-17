import { mulberry32 } from '../util/rng';
import type { LandformDetail, LandformSpec, OutlinePt, Pt } from '../cities/types';
import type { TreeSpec } from './chunks';

/** A landform ready to draw and test: its shoreline curve (with beach widths), grass outline, holes and details. */
export type PreparedLandform = {
  spec: LandformSpec;
  outline: OutlinePt[];
  grass: Pt[];
  holes: Pt[][];
  details: readonly LandformDetail[];
};

/** Clearance (m) kept between trees and a detail's footprint. */
const DETAIL_MARGIN = 8;

/**
 * A closed Catmull-Rom curve through `pts`, `samples` points per edge (each corner is one of them). Beach widths
 * interpolate linearly between corners; corners without one take `beach`.
 */
export function smoothOutline(pts: readonly OutlinePt[], samples: number, beach = 0): OutlinePt[] {
  const n = pts.length;
  const out: OutlinePt[] = [];
  const f = (a: number, b: number, c: number, d: number, t: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const b1 = p1.beach ?? beach;
    const b2 = p2.beach ?? beach;
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x, t), z: f(p0.z, p1.z, p2.z, p3.z, t), beach: b1 + (b2 - b1) * t });
    }
  }
  return out;
}

/** An ellipse outline about (cx, cz) with radii rx (along x before the turn) × rz, turned `deg` degrees, `n` points. */
export function ellipse(cx: number, cz: number, rx: number, rz: number, deg: number, n = 24): Pt[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const z = Math.sin(t) * rz;
    return { x: cx + x * c - z * s, z: cz + x * s + z * c };
  });
}

/** The outline of `path` thickened to `width`: mitred along its length, with half-circle caps at both ends. */
export function ribbon(path: readonly Pt[], width: number, capSegments = 6): Pt[] {
  const h = width / 2;
  const n = path.length;
  const normal = (a: Pt, b: Pt): Pt => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: -dz / l, z: dx / l };
  };
  const side = (sign: 1 | -1): Pt[] =>
    path.map((p, i) => {
      const n0 = i > 0 ? normal(path[i - 1]!, p) : normal(p, path[i + 1]!);
      const n1 = i < n - 1 ? normal(p, path[i + 1]!) : n0;
      const mx = n0.x + n1.x;
      const mz = n0.z + n1.z;
      const ml = Math.hypot(mx, mz) || 1;
      const scale = h / Math.max(0.3, (mx * n0.x + mz * n0.z) / ml);
      return { x: p.x + (sign * mx * scale) / ml, z: p.z + (sign * mz * scale) / ml };
    });
  const cap = (at: Pt, from: Pt): Pt[] => {
    // Half circle round `at`, starting on the side `from` lies and sweeping away from the path.
    const a0 = Math.atan2(from.z - at.z, from.x - at.x);
    const out: Pt[] = [];
    for (let k = 1; k < capSegments; k++) {
      const a = a0 - (k / capSegments) * Math.PI;
      out.push({ x: at.x + Math.cos(a) * h, z: at.z + Math.sin(a) * h });
    }
    return out;
  };
  const left = side(1);
  const right = side(-1);
  return [...left, ...cap(path[n - 1]!, left[n - 1]!), ...right.reverse(), ...cap(path[0]!, right[right.length - 1]!)];
}

/** Twice the signed area: positive when the outline runs anticlockwise in (x, z). */
function area2(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.z - q.x * p.z;
  }
  return a;
}

/** Each corner moved `dist` (or its own `beach`) inward along the mean of its two edges' inward normals. */
export function insetOutline(pts: readonly OutlinePt[], dist: number): Pt[] {
  const n = pts.length;
  const sign = area2(pts) > 0 ? 1 : -1;
  const inward = (a: Pt, b: Pt): Pt => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: (-dz / l) * sign, z: (dx / l) * sign };
  };
  return pts.map((p, i) => {
    const n0 = inward(pts[(i - 1 + n) % n]!, p);
    const n1 = inward(p, pts[(i + 1) % n]!);
    const mx = n0.x + n1.x;
    const mz = n0.z + n1.z;
    const ml = Math.hypot(mx, mz) || 1;
    const d = (p.beach ?? dist) / Math.max(0.3, (mx * n0.x + mz * n0.z) / ml);
    return { x: p.x + (mx / ml) * d, z: p.z + (mz / ml) * d };
  });
}

/** Whether (x, z) lies inside the polygon (even-odd rule). */
export function inPolygon(poly: readonly Pt[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function prepareLandform(spec: LandformSpec): PreparedLandform {
  const outline = spec.sharp ? spec.outline.map((p) => ({ ...p, beach: p.beach ?? spec.beach })) : smoothOutline(spec.outline, 8, spec.beach);
  return { spec, outline, grass: insetOutline(outline, spec.beach), holes: spec.holes.map((h) => [...h]), details: spec.details };
}

export function onLand(p: PreparedLandform, x: number, z: number): boolean {
  return inPolygon(p.outline, x, z) && !p.holes.some((h) => inPolygon(h, x, z));
}

export function onGrass(p: PreparedLandform, x: number, z: number): boolean {
  return inPolygon(p.grass, x, z) && !p.holes.some((h) => inPolygon(h, x, z));
}

/** Whether a detail's footprint (grown by `margin`) covers (x, z). */
export function onDetail(d: LandformDetail, x: number, z: number, margin = 0): boolean {
  const dx = x - d.x;
  const dz = z - d.z;
  if (d.kind === 'tower') return Math.hypot(dx, dz) <= d.r + margin;
  const c = Math.cos(d.yaw);
  const s = Math.sin(d.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= d.w / 2 + margin && Math.abs(lz) <= d.d / 2 + margin;
}

/** Grass with room for a tree: outside every clearing, and clear of every detail by DETAIL_MARGIN. */
export function treeSpot(p: PreparedLandform, x: number, z: number): boolean {
  return (
    onGrass(p, x, z) &&
    !(p.spec.clearings ?? []).some((c) => inPolygon(c, x, z)) &&
    !p.details.some((d) => onDetail(d, x, z, DETAIL_MARGIN))
  );
}

/** Trees on a jittered grid of one cell per spec.treeEvery m², kept where treeSpot allows, at most `max`. */
export function scatterTrees(p: PreparedLandform, seed: number, max: number): TreeSpec[] {
  const every = p.spec.treeEvery;
  if (every <= 0 || max <= 0) return [];
  const step = Math.sqrt(every);
  const xs = p.outline.map((q) => q.x);
  const zs = p.outline.map((q) => q.z);
  const rng = mulberry32(seed);
  const out: TreeSpec[] = [];
  for (let z = Math.min(...zs); z < Math.max(...zs) && out.length < max; z += step) {
    for (let x = Math.min(...xs); x < Math.max(...xs) && out.length < max; x += step) {
      const tx = x + rng() * step;
      const tz = z + rng() * step;
      const s = 14 + rng() * 12;
      if (treeSpot(p, tx, tz)) out.push({ x: tx, z: tz, s });
    }
  }
  return out;
}

/**
 * Every landform's trees (each scattered in full from `seed` + its index), thinned evenly across all of them to at
 * most `max` in total, so no landform loses its trees to an earlier one.
 */
export function allocateTrees(prepared: readonly PreparedLandform[], seed: number, max: number): TreeSpec[][] {
  const full = prepared.map((p, i) => scatterTrees(p, seed + i, Infinity));
  const total = full.reduce((n, t) => n + t.length, 0);
  if (total <= max) return full;
  // Keep the trees whose running index crosses a whole multiple of total / max: an even pick through every list.
  let k = 0;
  return full.map((list) =>
    list.filter(() => {
      const keep = Math.floor(((k + 1) * max) / total) > Math.floor((k * max) / total);
      k++;
      return keep;
    }),
  );
}
