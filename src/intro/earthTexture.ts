import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import { landAt } from './worldMap';

/** Texels; 4× the art scale `S` so the surface still reads as pixel terrain when the pod skims the atmosphere. */
const W = 512;
const H = 256;
const S = 4;
const OCEAN = [0x2f, 0x6f, 0xb5];
const OCEAN_DEEP = [0x24, 0x58, 0x9a];
const ICE = [0xf2, 0xf5, 0xf7];
const CLOUD = [0xff, 0xff, 0xff];
const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
/** Degrees per texel, both ways (equirectangular). */
const DEG = 360 / W;

/** The dry belts, as [lon min, lon max, lat min, lat max] boxes: their inland texels are desert. */
const DRY: readonly (readonly [number, number, number, number])[] = [
  [-17, 62, 14, 33], // the Sahara, Arabia and Iran
  [50, 80, 38, 47], // the Central Asian steppe deserts
  [90, 115, 38, 46], // the Gobi
  [-117, -103, 25, 37], // the American Southwest
  [12, 26, -30, -18], // the Kalahari
  [115, 145, -32, -19], // the Australian outback
];
const dry = (lon: number, lat: number) => DRY.some(([a, b, c, d]) => lon >= a && lon <= b && lat >= c && lat <= d);

export function earthTexture(): THREE.CanvasTexture {
  const P = CONFIG.palette;
  const LAND = rgb(P.ground);
  const LAND_DARK = rgb(P.groundDark);
  const DESERT = rgb(P.ochre);
  const rng = mulberry32(CONFIG.world.seed + 31);
  const swirls = Array.from({ length: 40 }, () => ({ x: rng() * W, y: 4 * S + rng() * (H - 8 * S), len: (6 + rng() * 22) * S, tilt: (rng() - 0.5) * 0.6 }));

  // The land mask: each texel samples the world map a little off its centre, for ragged pixel coastlines.
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lon = (x + 0.5 + (rng() - 0.5) * 1.3) * DEG - 180;
      const lat = 90 - (y + 0.5 + (rng() - 0.5) * 1.3) * DEG;
      mask[y * W + x] = landAt(lon, lat) ? 1 : 0;
    }
  }
  const at = (x: number, y: number) => mask[Math.min(H - 1, Math.max(0, y)) * W + (((x % W) + W) % W)]!;
  // Every texel `d` away along both axes is the same as this one: inland (or open sea).
  const deep = (x: number, y: number, d: number, v: number) => at(x - d, y) === v && at(x + d, y) === v && at(x, y - d) === v && at(x, y + d) === v;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) * DEG;
    for (let x = 0; x < W; x++) {
      const lon = (x + 0.5) * DEG - 180;
      let col: number[];
      if (at(x, y)) {
        if (lat > 70 || lat < -60) col = ICE;
        else if (dry(lon, lat) && deep(x, y, 4, 1)) col = DESERT;
        else if ((Math.abs(lat) < 12 || lat > 50) && deep(x, y, 3, 1)) col = LAND_DARK; // rainforest and taiga
        else col = LAND;
      } else col = deep(x, y, 3, 0) && deep(x, y, 2, 0) ? OCEAN_DEEP : OCEAN; // shallows hug the coasts
      if (y < 4 * S || y >= H - 4 * S) col = ICE;
      for (const s of swirls) {
        const dx = Math.min(Math.abs(x - s.x), W - Math.abs(x - s.x));
        const along = dx / s.len;
        const off = y - (s.y + dx * s.tilt + Math.sin(dx * (0.5 / S)) * 1.5 * S);
        if (along < 1 && Math.abs(off) < 1.2 * S * (1 - along)) col = CLOUD;
      }
      const o = (y * W + x) * 4;
      img.data[o] = col[0]!;
      img.data[o + 1] = col[1]!;
      img.data[o + 2] = col[2]!;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
