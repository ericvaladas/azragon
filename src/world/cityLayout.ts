import { CONFIG } from '../config';
import { mulberry32, range } from '../util/rng';

export type BuildingSpec = { x: number; z: number; w: number; d: number; h: number; style: number };

export type CityLayout = {
  buildings: BuildingSpec[];
  trees: { x: number; z: number; s: number }[];
  roadOrigin: number;
  pitch: number;
  half: number;
};

/** Grid city: roads on every block line, 2x2 lots per block, parks, and an empty crater clearing at the origin. */
export function generateCityLayout(seed: number): CityLayout {
  const w = CONFIG.world;
  const rng = mulberry32(seed);
  const half = w.citySize / 2;
  const pitch = w.blockSize;
  const n = Math.floor(w.citySize / pitch);
  const inner = pitch - w.roadWidth;
  const lot = inner / 2;
  const buildings: BuildingSpec[] = [];
  const trees: { x: number; z: number; s: number }[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = -half + (i + 0.5) * pitch;
      const cz = -half + (j + 0.5) * pitch;
      if (Math.hypot(cx, cz) < w.clearRadius + pitch * 0.5) continue;

      if (rng() < w.parkChance) {
        const count = 6 + Math.floor(rng() * 5);
        for (let t = 0; t < count; t++) {
          trees.push({ x: cx + range(rng, -inner / 2, inner / 2), z: cz + range(rng, -inner / 2, inner / 2), s: range(rng, 14, 26) });
        }
        continue;
      }

      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          if (rng() > 0.78) continue;
          const bw = lot * range(rng, 0.55, 0.85);
          const bd = lot * range(rng, 0.55, 0.85);
          const t = rng();
          buildings.push({
            x: cx + (a - 0.5) * lot,
            z: cz + (b - 0.5) * lot,
            w: bw,
            d: bd,
            h: w.minBuildingH + (w.maxBuildingH - w.minBuildingH) * t * t,
            style: Math.floor(rng() * CONFIG.palette.buildingFacades.length),
          });
        }
      }
    }
  }

  return { buildings, trees, roadOrigin: -half, pitch, half };
}
