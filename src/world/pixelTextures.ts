import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CityLayout } from './cityLayout';
import { mulberry32 } from '../util/rng';

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 16x32 white facade with a window grid; tinted per instance via instanceColor. */
export function facadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 16, 32);
  g.fillStyle = '#3d4a5e';
  for (let y = 2; y < 27; y += 4) {
    for (let x = 1; x < 16; x += 4) g.fillRect(x, y, 2, 2);
  }
  g.fillStyle = '#b8b0a4';
  g.fillRect(0, 29, 16, 3);
  return finish(c);
}

/** Whole-city ground map: grass with speckle, roads with dashed centre lines, and a dirt crater clearing. */
export function groundTexture(layout: CityLayout): THREE.CanvasTexture {
  const { palette, world } = CONFIG;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const px = size / world.citySize;
  const rng = mulberry32(world.seed + 1);

  g.fillStyle = hex(palette.ground);
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rng() < 0.75 ? hex(palette.groundDark) : hex(palette.ochre);
    g.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
  }

  const roadPx = Math.max(2, Math.round(world.roadWidth * px));
  const n = Math.round(world.citySize / layout.pitch);
  for (let k = 0; k <= n; k++) {
    const p = Math.round(k * layout.pitch * px);
    g.fillStyle = hex(palette.road);
    g.fillRect(p - roadPx / 2, 0, roadPx, size);
    g.fillRect(0, p - roadPx / 2, size, roadPx);
  }
  g.fillStyle = hex(palette.roadLine);
  for (let k = 0; k <= n; k++) {
    const p = Math.round(k * layout.pitch * px);
    for (let t = 0; t < size; t += 6) {
      g.fillRect(p, t, 1, 3);
      g.fillRect(t, p, 3, 1);
    }
  }

  const r = (world.clearRadius + layout.pitch * 0.5) * px;
  g.fillStyle = hex(palette.ochre);
  g.beginPath();
  g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hex(palette.dust);
  for (let i = 0; i < 400; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r;
    g.fillRect(Math.floor(size / 2 + Math.cos(a) * d), Math.floor(size / 2 + Math.sin(a) * d), 1, 1);
  }
  return finish(c);
}
