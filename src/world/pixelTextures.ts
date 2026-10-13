import * as THREE from 'three';
import { CONFIG } from '../config';
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

/**
 * Ground tile covering 2x2 city blocks: grass with speckle, roads on the block lines with dashed centre
 * lines. Wraps seamlessly, so a repeating plane gives an endless road grid aligned to world multiples of blockSize.
 */
export function blockGroundTexture(): THREE.CanvasTexture {
  const { palette, world } = CONFIG;
  const size = 128;
  const span = world.blockSize * 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const px = size / span;
  const rng = mulberry32(world.seed + 1);

  g.fillStyle = hex(palette.ground);
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = rng() < 0.75 ? hex(palette.groundDark) : hex(palette.ochre);
    g.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
  }

  const roadPx = Math.max(2, Math.round(world.roadWidth * px));
  const half = Math.floor(roadPx / 2);
  const lines = [0, Math.round(world.blockSize * px), size];
  g.fillStyle = hex(palette.road);
  for (const p of lines) {
    g.fillRect(p - half, 0, roadPx, size);
    g.fillRect(0, p - half, size, roadPx);
  }
  g.fillStyle = hex(palette.roadLine);
  for (const p of lines) {
    for (let t = 0; t < size; t += 6) {
      g.fillRect(p, t, 1, 3);
      g.fillRect(t, p, 3, 1);
    }
  }
  const tex = finish(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Round dirt patch for the crash crater; transparent outside the circle (use with alphaTest). */
export function craterTexture(): THREE.CanvasTexture {
  const { palette, world } = CONFIG;
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const rng = mulberry32(world.seed + 2);
  const r = size / 2;
  g.fillStyle = hex(palette.crater);
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  // A ragged, burnt patch in the middle where the pod struck.
  g.fillStyle = hex(palette.craterScorch);
  for (let i = 0; i < 900; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r * (0.35 + 0.15 * Math.sin(a * 5));
    g.fillRect(Math.floor(r + Math.cos(a) * d), Math.floor(r + Math.sin(a) * d), 2, 2);
  }
  g.fillStyle = hex(palette.craterFleck);
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * (r - 2);
    g.fillRect(Math.floor(r + Math.cos(a) * d), Math.floor(r + Math.sin(a) * d), 1, 1);
  }
  return finish(c);
}
