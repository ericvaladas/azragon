import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import type { CityStyle } from '../cities/types';
import { FACADE_COUNT } from '../cities/types';

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

/** One facade cell repeats every FACADE_TILE metres (width along the face, height up it). */
export const FACADE_TILE = { w: 16, h: 24 } as const;
const CELL_W = 16;
const CELL_H = 24;

/**
 * Facade atlas: FACADE_COUNT cells of CELL_W × CELL_H px, left to right: glass curtain wall, office window bands,
 * residential balconies, shop fronts. Light greys and whites, so the per-building tint colours them.
 */
export function facadeAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL_W * FACADE_COUNT;
  c.height = CELL_H;
  const g = c.getContext('2d')!;
  const cell = (k: number, draw: (x0: number) => void) => draw(k * CELL_W);
  // 0: glass: pale panes, thin dark mullions, a lighter sky-reflection band.
  cell(0, (x0) => {
    g.fillStyle = '#c9d4dc';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    g.fillStyle = '#e8eef2';
    g.fillRect(x0, 4, CELL_W, 6);
    g.fillStyle = '#5d6a74';
    for (let x = 0; x < CELL_W; x += 4) g.fillRect(x0 + x, 0, 1, CELL_H);
    for (let y = 0; y < CELL_H; y += 6) g.fillRect(x0, y, CELL_W, 1);
  });
  // 1: office: white spandrels with dark window bands.
  cell(1, (x0) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    g.fillStyle = '#3d4a5e';
    for (let y = 2; y < CELL_H; y += 6) g.fillRect(x0, y, CELL_W, 3);
    g.fillStyle = '#b8b0a4';
    for (let x = 0; x < CELL_W; x += 8) g.fillRect(x0 + x, 0, 1, CELL_H);
  });
  // 2: residential: rows of balconies (light rails over dark doors), small windows between.
  cell(2, (x0) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    for (let y = 0; y < CELL_H; y += 8) {
      g.fillStyle = '#4a4f57';
      g.fillRect(x0 + 2, y + 2, 4, 4);
      g.fillRect(x0 + 10, y + 2, 4, 4);
      g.fillStyle = '#d9d3c8';
      g.fillRect(x0 + 1, y + 6, 14, 2);
    }
  });
  // 3: shop fronts: small bright windows, some lit warm.
  cell(3, (x0) => {
    g.fillStyle = '#f2efe9';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    const rng = mulberry32(CONFIG.world.seed + 7);
    for (let y = 1; y < CELL_H; y += 4) for (let x = 1; x < CELL_W; x += 4) {
      g.fillStyle = rng() < 0.3 ? '#ffe9a8' : '#4a5566';
      g.fillRect(x0 + x, y, 2, 2);
    }
  });
  return finish(c);
}

/**
 * Ground tile covering 2 × 2 blocks in a city's colours: paved with speckle; roads on the block lines with dashed
 * centre lines; zebra crosswalks across every road arm at each intersection. Wraps seamlessly.
 */
export function cityGroundTexture(style: CityStyle): THREE.CanvasTexture {
  const { world } = CONFIG;
  const C = style.colors;
  const size = 128;
  const span = world.blockSize * 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const px = size / span;
  const rng = mulberry32(world.seed + 1);
  g.fillStyle = hex(C.paved);
  g.fillRect(0, 0, size, size);
  g.fillStyle = hex(C.pavedSpeck);
  for (let i = 0; i < 500; i++) g.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
  const roadPx = Math.max(2, Math.round(world.roadWidth * px));
  const half = Math.floor(roadPx / 2);
  const lines = [0, Math.round(world.blockSize * px), size];
  g.fillStyle = hex(C.road);
  for (const p of lines) {
    g.fillRect(p - half, 0, roadPx, size);
    g.fillRect(0, p - half, size, roadPx);
  }
  g.fillStyle = hex(C.roadLine);
  for (const p of lines) for (let t = 0; t < size; t += 6) {
    g.fillRect(p, t, 1, 3);
    g.fillRect(t, p, 3, 1);
  }
  // Crosswalks: stripes across each arm, just outside every intersection.
  g.fillStyle = hex(C.crosswalk);
  for (const ix of lines) for (const iz of lines) {
    for (let s = -half; s < half; s += 2) {
      for (const o of [half + 1, -half - 2]) {
        g.fillRect(ix + s, iz + o, 1, 1);
        g.fillRect(ix + o, iz + s, 1, 1);
      }
    }
  }
  const tex = finish(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Stripe rectangles of the scramble overlay on an n × n pixel grid: four straight zebra crossings at the edges of the
 * intersection plus both diagonals. `roadWidth` is in metres over `size` metres of ground. Whole pixels only, so
 * nearest-filtered alpha-tested stripes stay crisp.
 */
export function scrambleStripes(n: number, roadWidth: number, size: number): Rect[] {
  const out: Rect[] = [];
  const m = n / 2;
  const road = Math.round((roadWidth / size) * n);
  const half = Math.floor(road / 2);
  for (let t = -half; t < half; t += 2) {
    for (const e of [Math.round(m - road / 2 - 4), Math.round(m + road / 2 + 1)]) {
      out.push({ x: m + t, y: e, w: 1, h: 3 });
      out.push({ x: e, y: m + t, w: 3, h: 1 });
    }
  }
  for (let k = -m + 6; k < m - 6; k += 2) for (let s = -2; s <= 2; s++) {
    out.push({ x: m + k + s, y: m + k - s, w: 1, h: 1 });
    out.push({ x: m + k + s, y: m - k + s, w: 1, h: 1 });
  }
  return out;
}

/** The Shibuya scramble: zebra crossings on all four arms plus both diagonals, transparent elsewhere (use alphaTest). */
export function scrambleTexture(): THREE.CanvasTexture {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f0ea';
  for (const r of scrambleStripes(n, CONFIG.world.roadWidth, 120)) g.fillRect(r.x, r.y, r.w, r.h);
  return finish(c);
}

export const SCREEN_FRAMES = 4;

/** Video-screen frames left to right (SCREEN_FRAMES × 32 × 18 px): bold pixel pictures in neon colours. */
export function screenTexture(): THREE.CanvasTexture {
  const fw = 32;
  const fh = 18;
  const c = document.createElement('canvas');
  c.width = fw * SCREEN_FRAMES;
  c.height = fh;
  const g = c.getContext('2d')!;
  const bg = ['#1b1440', '#0f2a3a', '#2a0f2a', '#101a10'];
  const fg = ['#ff3fb4', '#35e8ff', '#ffd23a', '#7a5cff'];
  for (let f = 0; f < SCREEN_FRAMES; f++) {
    const x0 = f * fw;
    g.fillStyle = bg[f]!;
    g.fillRect(x0, 0, fw, fh);
    g.fillStyle = fg[f]!;
    if (f === 0) for (let i = 0; i < 6; i++) g.fillRect(x0 + 3 + i * 5, 14 - i * 2, 3, 2 + i * 2);
    if (f === 1) { g.fillRect(x0 + 10, 4, 12, 10); g.fillStyle = '#ffffff'; g.fillRect(x0 + 13, 7, 2, 2); g.fillRect(x0 + 18, 7, 2, 2); }
    if (f === 2) for (let i = 0; i < 4; i++) g.fillRect(x0 + 3, 3 + i * 4, 6 + ((i * 7) % 20), 2);
    if (f === 3) { g.fillRect(x0 + 4, 4, 24, 3); g.fillRect(x0 + 4, 11, 24, 3); g.fillStyle = '#ffffff'; g.fillRect(x0 + 14, 2, 4, 14); }
  }
  return finish(c);
}

/** Everything the city draws with a texture; injectable so City can be built in tests without a DOM. */
export type CityTextures = {
  ground(style: CityStyle): THREE.Texture;
  crater(): THREE.Texture;
  facades(): THREE.Texture;
  screen(): THREE.Texture;
  overlay(id: string): THREE.Texture;
};

export const canvasCityTextures: CityTextures = {
  ground: cityGroundTexture,
  crater: craterTexture,
  facades: facadeAtlas,
  screen: screenTexture,
  overlay: () => scrambleTexture(),
};

/**
 * Facade material hook: each building instance picks an atlas cell (attribute aFacade) and the cell repeats by the
 * building's size, one per FACADE_TILE metres, so tall towers get more floors rather than stretched windows.
 */
export function patchFacadeShader(sh: { vertexShader: string; fragmentShader: string }): void {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aFacade;\nvarying float vFacade;\nvarying vec2 vFacadeUv;')
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
  vFacade = aFacade;
  float across = abs(normal.x) > 0.5 ? length(instanceMatrix[2].xyz) : length(instanceMatrix[0].xyz);
  vFacadeUv = vec2(uv.x * across / ${FACADE_TILE.w.toFixed(1)}, uv.y * length(instanceMatrix[1].xyz) / ${FACADE_TILE.h.toFixed(1)});`,
    );
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFacade;\nvarying vec2 vFacadeUv;')
    .replace(
      '#include <map_fragment>',
      `vec2 facadeUv = vec2((fract(vFacadeUv.x) + vFacade) / ${FACADE_COUNT.toFixed(1)}, fract(vFacadeUv.y));
  diffuseColor *= texture2D(map, facadeUv);`,
    );
}
