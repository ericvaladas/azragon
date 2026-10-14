import * as THREE from 'three';
import { CONFIG } from '../config';
import { mulberry32 } from '../util/rng';
import type { CityStyle, GlyphSet, GroundOverlay } from '../cities/types';
import { lineWidth, PITCH } from './roads';
import { SIGN_WORDS, latinBoardRects } from './latinFont';
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

/** One shipping container's height in atlas pixels (1 px per metre). */
const CONTAINER_PX = 2.6;

/**
 * Facade atlas: FACADE_COUNT cells of CELL_W × CELL_H px, left to right: glass curtain wall, office window bands,
 * residential balconies, shop fronts, ribbed container sides. Light greys and whites, so the per-building tint colours them.
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
    g.fillStyle = '#7f93ab';
    for (let y = 2; y < CELL_H; y += 6) g.fillRect(x0, y, CELL_W, 3);
    g.fillStyle = '#b8b0a4';
    for (let x = 0; x < CELL_W; x += 8) g.fillRect(x0 + x, 0, 1, CELL_H);
  });
  // 2: residential: rows of balconies (light rails over dark doors), small windows between.
  cell(2, (x0) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x0, 0, CELL_W, CELL_H);
    for (let y = 0; y < CELL_H; y += 8) {
      g.fillStyle = '#8a9aae';
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
      g.fillStyle = rng() < 0.35 ? '#ffe9a8' : '#8796aa';
      g.fillRect(x0 + x, y, 2, 2);
    }
  });
  // 4: container sides: 1 px light and dark vertical ribs with a dark door seam at the cell's edge (so a block reads as
  // a row of containers, one per FACADE_TILE.w), crossed by a dark rail at every container joint (1 px = 1 m, so the
  // rails repeat every 2.6 m, rounded down to the pixel, and each block shows its tiers).
  cell(4, (x0) => {
    for (let x = 0; x < CELL_W; x++) {
      g.fillStyle = x === 0 ? '#5a5a5a' : x % 2 === 0 ? '#f4f4f4' : '#b4b4b4';
      g.fillRect(x0 + x, 0, 1, CELL_H);
    }
    g.fillStyle = '#5a5a5a';
    // Canvas rows run top-down; the facade's v runs up from the building's base.
    for (let k = 0; k * CONTAINER_PX < CELL_H; k++) g.fillRect(x0, CELL_H - 1 - Math.floor(k * CONTAINER_PX), CELL_W, 1);
  });
  return finish(c);
}

/** Ground tile covering 2 × 2 blocks in a city's colours: plain paving with speckle (roads are their own meshes). Wraps seamlessly. */
export function cityGroundTexture(style: CityStyle): THREE.CanvasTexture {
  const { world } = CONFIG;
  const C = style.colors;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const rng = mulberry32(world.seed + 1);
  g.fillStyle = hex(C.paved);
  g.fillRect(0, 0, size, size);
  g.fillStyle = hex(C.pavedSpeck);
  for (let i = 0; i < 500; i++) g.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 1, 1);
  const tex = finish(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Road texture size: across the road (u) × along one segment (v), in px. */
const ROAD_TEX = { w: 8, h: 64 } as const;

/**
 * One road segment, stretched over its quad (u across, v along): asphalt, white edge lines, a dashed centre line, and
 * zebra crosswalk stripes in the last 6 px at each end.
 */
export function roadTexture(style: CityStyle): THREE.CanvasTexture {
  const C = style.colors;
  const { w, h } = ROAD_TEX;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(C.road);
  g.fillRect(0, 0, w, h);
  g.fillStyle = hex(C.roadLine);
  g.fillRect(0, 0, 1, h);
  g.fillRect(w - 1, 0, 1, h);
  for (let y = 9; y < h - 9; y += 8) g.fillRect(w / 2 - 1, y, 2, 4);
  // Crosswalks: stripes along the road, symmetric about the centre; the middle pair meets as one wide stripe.
  g.fillStyle = hex(C.road);
  g.fillRect(0, 0, w, 6);
  g.fillRect(0, h - 6, w, 6);
  g.fillStyle = hex(C.crosswalk);
  for (const x of [1, 3, 4, 6]) {
    g.fillRect(x, 1, 1, 5);
    g.fillRect(x, h - 6, 1, 5);
  }
  return finish(c);
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Widths (m) of the two roads through a crossing: `ns` runs north-south (along z), `ew` east-west (along x). */
export type ScrambleArms = { ns: number; ew: number };

/** The arm widths of a crossing overlay, from the lattice lines through its node. */
export function scrambleArms(ov: GroundOverlay): ScrambleArms {
  return { ns: lineWidth(Math.round(ov.x / PITCH)), ew: lineWidth(Math.round(ov.z / PITCH)) };
}

/** Depth of each arm's zebra and its gap from the intersection square, in px. */
const ZEBRA = { depth: 4, gap: 1 } as const;

/**
 * Stripe rectangles of the scramble overlay on an n × n pixel grid over `size` metres of ground (texture x is world
 * +x, texture y is world +z). Each arm gets a zebra across its own width, just outside the intersection square (as
 * wide as the widest arm, like the road network's node square); both diagonal bands stay inside the square. Stripes
 * pair off symmetrically about the centre, the middle pair meeting as one wide stripe. Whole pixels only, so
 * nearest-filtered alpha-tested stripes stay crisp.
 */
export function scrambleStripes(n: number, size: number, arms: ScrambleArms): Rect[] {
  const out: Rect[] = [];
  const m = n / 2;
  const px = n / size;
  const sq = Math.ceil((Math.max(arms.ns, arms.ew) / 2) * px);
  const near = sq + ZEBRA.gap;
  // Stripe cells across one arm: m - 1 - 2k on one side, its mirror m + 2k on the other, within the road's half width.
  const across = (width: number): number[] => {
    const half = Math.floor((width / 2) * px);
    const cells: number[] = [];
    for (let k = 0; 2 * k + 1 <= half; k++) cells.push(m - 1 - 2 * k, m + 2 * k);
    return cells;
  };
  for (const c of across(arms.ns)) {
    out.push({ x: c, y: m - near - ZEBRA.depth, w: 1, h: ZEBRA.depth });
    out.push({ x: c, y: m + near, w: 1, h: ZEBRA.depth });
  }
  for (const c of across(arms.ew)) {
    out.push({ x: m - near - ZEBRA.depth, y: c, w: ZEBRA.depth, h: 1 });
    out.push({ x: m + near, y: c, w: ZEBRA.depth, h: 1 });
  }
  // Diagonal bands: 5 px dashes across each diagonal, every 2 px, inside the square's whole pixels.
  const inner = Math.floor((Math.max(arms.ns, arms.ew) / 2) * px);
  for (let k = 3 - inner; k <= inner - 3; k += 2) for (let s = -2; s <= 2; s++) {
    out.push({ x: m + k + s, y: m + k - s, w: 1, h: 1 });
    out.push({ x: m + k + s, y: m - k + s, w: 1, h: 1 });
  }
  return out;
}

/** The Shibuya scramble: a zebra across each arm plus both diagonals, transparent elsewhere (use alphaTest). */
export function scrambleTexture(ov: GroundOverlay): THREE.CanvasTexture {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f0ea';
  // Canvas row 0 is the texture's top (v = 1), which the overlay plane puts at its −z edge: rows run along +z.
  for (const r of scrambleStripes(n, ov.size, scrambleArms(ov))) g.fillRect(r.x, r.y, r.w, r.h);
  return finish(c);
}

/**
 * Road material hook: per-segment switches (attribute aPlainEnds: x the start node's end, y the end node's end) that
 * replace that end's crosswalk with plain asphalt, sampling the stripe-free row just inside it. The start node's end is
 * the texture's top (v near 1), the end node's end its bottom.
 */
export function patchRoadShader(sh: { vertexShader: string; fragmentShader: string }): void {
  const h = ROAD_TEX.h.toFixed(1);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aPlainEnds;\nvarying vec2 vPlainEnds;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vPlainEnds = aPlainEnds;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vPlainEnds;')
    .replace(
      '#include <map_fragment>',
      `vec2 roadUv = vMapUv;
  if (vPlainEnds.x > 0.5 && roadUv.y > 1.0 - 6.0 / ${h}) roadUv.y = 1.0 - 7.5 / ${h};
  if (vPlainEnds.y > 0.5 && roadUv.y < 6.0 / ${h}) roadUv.y = 7.5 / ${h};
  diffuseColor *= texture2D(map, roadUv);`,
    );
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

/** The texture painter of each ground decal id. */
const OVERLAY_PAINTERS: Readonly<Record<string, (ov: GroundOverlay) => THREE.CanvasTexture>> = {
  scramble: scrambleTexture,
};

/** The painter for overlay `id`; an id with no painter is a programming error. */
export function overlayPainter(id: string): (ov: GroundOverlay) => THREE.CanvasTexture {
  const paint = OVERLAY_PAINTERS[id];
  if (!paint) throw new Error(`no overlay texture for '${id}'`);
  return paint;
}

/** The texture of ground decal `ov`, chosen by its id. */
export function overlayTexture(ov: GroundOverlay): THREE.CanvasTexture {
  return overlayPainter(ov.id)(ov);
}

/** Everything the city draws with a texture; injectable so City can be built in tests without a DOM. */
export type CityTextures = {
  ground(style: CityStyle): THREE.Texture;
  crater(): THREE.Texture;
  facades(): THREE.Texture;
  screen(): THREE.Texture;
  signs(glyphs: GlyphSet): THREE.Texture;
  overlay(ov: GroundOverlay): THREE.Texture;
  road(style: CityStyle): THREE.Texture;
};

export const canvasCityTextures: CityTextures = {
  ground: cityGroundTexture,
  crater: craterTexture,
  facades: facadeAtlas,
  screen: screenTexture,
  signs: (glyphs) => signAtlas(glyphs),
  overlay: overlayTexture,
  road: roadTexture,
};

/**
 * A facade texel is a window when its linear blue exceeds its red by this much: the bluish window inks of the atlas
 * (office bands, balcony and shop windows) pass, pale glass panes, mullions, whites and greys do not.
 */
export const WINDOW_CHROMA = 0.145;

/** Whether an atlas ink counts as a lit window (the shader's test, on the CPU). */
export function isWindowTexel(hex: number): boolean {
  const c = new THREE.Color(hex);
  return c.b - c.r >= WINDOW_CHROMA;
}

/**
 * Facade material hook: each building instance picks an atlas cell (attribute aFacade) and the cell repeats by the
 * building's size, one per FACADE_TILE metres, so tall towers get more floors rather than stretched windows. With
 * `glow`, window texels (see WINDOW_CHROMA) also emit the shared uniform's colour: lit windows at no extra draw call.
 */
export function patchFacadeShader(
  sh: { uniforms?: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string },
  glow?: { value: THREE.Color },
): void {
  if (glow && sh.uniforms) sh.uniforms['uWindowGlow'] = glow;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aFacade;\nvarying float vFacade;\nvarying vec2 vFacadeUv;')
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
  vFacade = aFacade;
  float across = abs(normal.x) > 0.5 ? length(instanceMatrix[2].xyz) : length(instanceMatrix[0].xyz);
  vFacadeUv = vec2(uv.x * across / ${FACADE_TILE.w.toFixed(1)}, uv.y * length(instanceMatrix[1].xyz) / ${FACADE_TILE.h.toFixed(1)});`,
    );
  const glowDecl = glow ? '\nuniform vec3 uWindowGlow;' : '';
  const glowAdd = glow ? `\n  totalEmissiveRadiance += uWindowGlow * step(${WINDOW_CHROMA.toFixed(3)}, facadeTexel.b - facadeTexel.r);` : '';
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying float vFacade;\nvarying vec2 vFacadeUv;${glowDecl}`)
    .replace(
      '#include <map_fragment>',
      `vec2 facadeUv = vec2((fract(vFacadeUv.x) + vFacade) / ${FACADE_COUNT.toFixed(1)}, fract(vFacadeUv.y));
  vec4 facadeTexel = texture2D(map, facadeUv);
  diffuseColor *= facadeTexel;${glowAdd}`,
    );
}

/** Sign atlas size (px) and the UV rect (u0, v0, u1, v1) of each cell: 0–2 vertical glyph boards, 3–5 billboards. */
const SA = 64;
const rect = (x: number, y: number, w: number, h: number): readonly [number, number, number, number] => [x / SA, 1 - (y + h) / SA, (x + w) / SA, 1 - y / SA];
export const SIGN_RECTS = [rect(0, 0, 12, 48), rect(12, 0, 12, 48), rect(24, 0, 12, 48), rect(36, 0, 28, 16), rect(36, 16, 28, 16), rect(36, 32, 28, 16)] as const;

/**
 * Sign atlas. Vertical boards: bright panels (tinted to the sign colour) with a dark frame and a column of dark
 * glyphs: blocky kanji-like strokes, or a Latin word (SIGN_WORDS). Billboards: small full-colour pictures (drawn
 * untinted): Tokyo's drink can, anime face and logo, or Latin logos and lettering.
 */
export function signAtlas(glyphs: GlyphSet = 'kanji'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = SA;
  c.height = SA;
  const g = c.getContext('2d')!;
  const rng = mulberry32(CONFIG.world.seed + 11);
  for (let k = 0; k < 3; k++) {
    const x0 = k * 12;
    g.fillStyle = '#ffffff';
    g.fillRect(x0, 0, 12, 48);
    g.fillStyle = '#26222e';
    g.fillRect(x0, 0, 12, 1);
    g.fillRect(x0, 47, 12, 1);
    g.fillRect(x0, 0, 1, 48);
    g.fillRect(x0 + 11, 0, 1, 48);
    if (glyphs === 'latin') {
      for (const r of latinBoardRects(SIGN_WORDS[k]!, x0)) g.fillRect(r.x, r.y, r.w, r.h);
      continue;
    }
    // Glyphs: 8 × 8 cells stacked down the board, each a few strokes.
    for (let y = 3; y + 8 <= 46; y += 9) {
      const gx = x0 + 2;
      g.fillRect(gx + 3, y, 2, 8);
      if (rng() < 0.8) g.fillRect(gx, y + 1 + Math.floor(rng() * 3), 8, 1);
      if (rng() < 0.7) g.fillRect(gx + 1, y + 5 + Math.floor(rng() * 2), 6, 1);
      if (rng() < 0.6) g.fillRect(gx + (rng() < 0.5 ? 0 : 6), y + 2, 2, 5);
      if (rng() < 0.5) g.fillRect(gx + 1, y + 7, 6, 1);
    }
  }
  if (glyphs === 'latin') latinBillboards(g);
  else kanjiBillboards(g);
  return finish(c);
}

/** Tokyo's billboards (cells 3–5): a drink can on yellow, an anime face on pink, a logo and text on deep blue. */
function kanjiBillboards(g: CanvasRenderingContext2D): void {
  // Billboard 3: a drink can on yellow with a red band of text.
  g.fillStyle = '#ffd23a';
  g.fillRect(36, 0, 28, 16);
  g.fillStyle = '#e8502a';
  g.fillRect(38, 2, 6, 12);
  g.fillStyle = '#ffffff';
  g.fillRect(39, 5, 4, 2);
  g.fillStyle = '#2a2a3a';
  for (let i = 0; i < 4; i++) g.fillRect(47 + i * 4, 5, 3, 3);
  g.fillRect(47, 10, 14, 2);
  // Billboard 4: an anime face on pink.
  g.fillStyle = '#ff8fc8';
  g.fillRect(36, 16, 28, 16);
  g.fillStyle = '#fbe3cf';
  g.fillRect(44, 19, 12, 11);
  g.fillStyle = '#4a2a6a';
  g.fillRect(43, 17, 14, 4);
  g.fillRect(43, 17, 2, 10);
  g.fillRect(55, 17, 2, 10);
  g.fillStyle = '#35a0ff';
  g.fillRect(46, 23, 2, 3);
  g.fillRect(52, 23, 2, 3);
  g.fillStyle = '#e8502a';
  g.fillRect(49, 27, 2, 1);
  // Billboard 5: a white logo and text on deep blue.
  g.fillStyle = '#1f4fa8';
  g.fillRect(36, 32, 28, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(39, 36, 8, 8);
  g.fillStyle = '#1f4fa8';
  g.fillRect(41, 38, 4, 4);
  g.fillStyle = '#ffffff';
  g.fillRect(50, 36, 11, 2);
  g.fillRect(50, 40, 8, 2);
  g.fillStyle = '#35e8ff';
  g.fillRect(50, 44, 11, 1);
}

/** Latin billboards (cells 3–5): simple logo shapes beside blocky lettering. */
function latinBillboards(g: CanvasRenderingContext2D): void {
  // Billboard 3: a red leaf-like star on white, red lettering bars.
  g.fillStyle = '#f4f1ea';
  g.fillRect(36, 0, 28, 16);
  g.fillStyle = '#d8322a';
  g.fillRect(41, 3, 2, 10);
  g.fillRect(38, 6, 8, 3);
  g.fillRect(39, 4, 6, 2);
  g.fillRect(48, 4, 13, 3);
  g.fillRect(48, 9, 9, 2);
  // Billboard 4: a coffee cup with steam on deep red, cream lettering.
  g.fillStyle = '#8a1c22';
  g.fillRect(36, 16, 28, 16);
  g.fillStyle = '#f2e6cf';
  g.fillRect(39, 22, 7, 7);
  g.fillRect(46, 24, 2, 3);
  g.fillRect(41, 18, 1, 3);
  g.fillRect(43, 18, 1, 3);
  g.fillRect(50, 20, 11, 2);
  g.fillRect(50, 24, 8, 2);
  g.fillRect(50, 28, 10, 1);
  // Billboard 5: a white ring logo on blue, white and amber lettering.
  g.fillStyle = '#1f4fa8';
  g.fillRect(36, 32, 28, 16);
  g.fillStyle = '#ffffff';
  g.fillRect(39, 35, 8, 10);
  g.fillStyle = '#1f4fa8';
  g.fillRect(41, 37, 4, 6);
  g.fillStyle = '#ffffff';
  g.fillRect(50, 36, 11, 2);
  g.fillRect(50, 40, 7, 2);
  g.fillStyle = '#ffc23a';
  g.fillRect(50, 44, 11, 1);
}
