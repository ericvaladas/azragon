import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';

const W = 128;
const H = 64;
const OCEAN = [0x2f, 0x6f, 0xb5];
const OCEAN_DEEP = [0x24, 0x58, 0x9a];
const ICE = [0xf2, 0xf5, 0xf7];
const CLOUD = [0xff, 0xff, 0xff];
const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

export function earthTexture(): THREE.CanvasTexture {
  const P = CONFIG.palette;
  const LAND = rgb(P.ground);
  const LAND_DARK = rgb(P.groundDark);
  const DESERT = rgb(P.ochre);
  const rng = mulberry32(CONFIG.world.seed + 31);
  const blobs = Array.from({ length: 9 }, () => ({ x: rng() * W, y: 10 + rng() * (H - 20), r: 6 + rng() * 12 }));
  const swirls = Array.from({ length: 14 }, () => ({ x: rng() * W, y: 4 + rng() * (H - 8), len: 10 + rng() * 22, tilt: (rng() - 0.5) * 0.6 }));

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let land = 0;
      for (const b of blobs) {
        const dx = Math.min(Math.abs(x - b.x), W - Math.abs(x - b.x)); // wraps around the globe
        const dy = y - b.y;
        land += Math.exp(-(dx * dx + dy * dy) / (b.r * b.r));
      }
      land += (rng() - 0.5) * 0.12; // ragged pixel coastlines
      let col = land > 0.55 ? (Math.abs(y - H / 2) < 7 && land < 0.9 ? DESERT : land > 1.1 ? LAND_DARK : LAND) : land > 0.35 ? OCEAN : OCEAN_DEEP;
      if (y < 4 || y >= H - 4) col = ICE;
      for (const s of swirls) {
        const dx = Math.min(Math.abs(x - s.x), W - Math.abs(x - s.x));
        const along = dx / s.len;
        const off = y - (s.y + dx * s.tilt + Math.sin(dx * 0.5) * 1.5);
        if (along < 1 && Math.abs(off) < 1.2 * (1 - along)) col = CLOUD;
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
