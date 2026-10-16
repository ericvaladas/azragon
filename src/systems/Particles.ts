import * as THREE from 'three';
import { CONFIG } from '../config';
import { faceted } from '../render/toon';

export type ParticleKind = 'dust' | 'debris' | 'fire' | 'smoke' | 'spark' | 'acid' | 'plasma' | 'trail' | 'ink' | 'rot' | 'shade' | 'mist' | 'bone' | 'wisp' | 'hexfire' | 'hexember' | 'wraith' | 'billow' | 'veil' | 'splash' | 'napalm' | 'ember' | 'contrail';

/**
 * `stretch`: drawn upright and this many times taller than wide, flickering (flame tongues) instead of tumbling.
 * `fadeFrom`: the fraction of its life after which a puff shrinks away (0.75 when absent).
 * `grows`: smoke that keeps swelling to the end of its life, never shrinking; it is gone at full size unless it also
 * has `fadeAlpha` (only on a layer built with per-particle opacity), which fades it to transparent from `fadeFrom`.
 */
type Preset = { color: number; life: number; size0: number; size1: number; speed: number; up: number; gravity: number; drag: number; stretch?: number; fadeFrom?: number; grows?: boolean; fadeAlpha?: boolean };

const P = CONFIG.palette;
const W = CONFIG.wendigo.colors;
export const PRESETS: Record<ParticleKind, Preset> = {
  dust: { color: P.dust, life: 1.3, size0: 22, size1: 70, speed: 110, up: 40, gravity: -15, drag: 2.2 },
  debris: { color: P.debris, life: 1.6, size0: 12, size1: 8, speed: 160, up: 260, gravity: 420, drag: 0.3 },
  fire: { color: P.fire, life: 0.55, size0: 34, size1: 4, speed: 70, up: 60, gravity: -40, drag: 1.5 },
  smoke: { color: P.smoke, life: 1.4, size0: 18, size1: 60, speed: 40, up: 70, gravity: -20, drag: 1.2, grows: true, fadeFrom: 0.4, fadeAlpha: true },
  /** Long-lived streak puffs for artillery shells, so their arc points back to the guns. */
  trail: { color: 0xe9e4da, life: 2.6, size0: 16, size1: 30, speed: 4, up: 4, gravity: 0, drag: 2, grows: true, fadeFrom: 0.4, fadeAlpha: true },
  /** A chemtrail puff behind a Gustav shell: pale, slow, swelling as it fades. */
  contrail: { color: 0xf4f2ec, life: 1.2, size0: 10, size1: 46, speed: 3, up: 2, gravity: 0, drag: 2, grows: true, fadeFrom: 0.2, fadeAlpha: true },
  acid: { color: P.acid, life: 0.7, size0: 26, size1: 6, speed: 150, up: 90, gravity: 120, drag: 1 },
  /** Wendigo decay: black-green clumps of rot that splatter and fall. */
  rot: { color: W.rot, life: 0.9, size0: 26, size1: 8, speed: 150, up: 100, gravity: 170, drag: 1.2 },
  /** Black-purple shadow smoke that swells and creeps upward. */
  shade: { color: W.shade, life: 1.3, size0: 24, size1: 64, speed: 70, up: 45, gravity: -18, drag: 2 },
  /** Dark blood mist that hangs where claws land. */
  mist: { color: W.mist, life: 1.0, size0: 22, size1: 58, speed: 120, up: 55, gravity: -6, drag: 2.6 },
  /** Bone-white splinters. */
  bone: { color: W.boneShard, life: 0.5, size0: 12, size1: 4, speed: 230, up: 90, gravity: 260, drag: 0.6 },
  /** Black fire: near-black flame tongues that leap up and shrink away, flickering. */
  hexfire: { color: W.hexfire, life: 0.6, size0: 34, size1: 6, speed: 45, up: 210, gravity: -220, drag: 1.6, stretch: 2.4 },
  /** The deep violet heart of black fire, a few among the black tongues. */
  hexember: { color: W.hexember, life: 0.5, size0: 20, size1: 4, speed: 50, up: 200, gravity: -200, drag: 1.4, stretch: 1.8 },
  /** Napalm fire: orange flame tongues that leap up off a burning patch and shrink away, flickering. */
  napalm: { color: P.napalmFire, life: 0.7, size0: 40, size1: 8, speed: 40, up: 230, gravity: -200, drag: 1.6, stretch: 2.2 },
  /** Bright embers that drift up out of napalm fire. */
  ember: { color: 0xffc23a, life: 1.2, size0: 8, size1: 3, speed: 60, up: 150, gravity: -30, drag: 1.2 },
  /** A Hungry Ghost's short smoky tail. */
  wraith: { color: W.shade, life: 0.32, size0: 24, size1: 30, speed: 8, up: 8, gravity: -10, drag: 2 },
  /** Pale ghost-light motes shed by the Hungry Ghosts. */
  wisp: { color: W.ghost, life: 0.6, size0: 12, size1: 3, speed: 30, up: 30, gravity: -10, drag: 2 },
  plasma: { color: CONFIG.kaiju.colors.plasma, life: 0.7, size0: 26, size1: 6, speed: 150, up: 90, gravity: 120, drag: 1 },
  spark: { color: P.eye, life: 0.3, size0: 10, size1: 2, speed: 260, up: 80, gravity: 200, drag: 0.5 },
  /** The pod crash's dust cloud: huge, slow billows that roll out across the city and hang (readable from high up). */
  billow: { color: 0x9c8a70, life: 2.3, size0: 200, size1: 520, speed: 280, up: 240, gravity: -10, drag: 1.3 },
  /** The cloud that erupts over the crater at impact and hides it: big, dense, slowly swelling puffs that thin away. */
  veil: { color: 0xb5a588, life: 3.2, size0: 240, size1: 460, speed: 110, up: 30, gravity: -6, drag: 1.4, fadeFrom: 0.38 },
  /** Water spray: white drops thrown up fast that fall back down. */
  splash: { color: 0xf4f8fb, life: 0.9, size0: 18, size1: 6, speed: 90, up: 300, gravity: 520, drag: 0.8 },
  ink: { color: CONFIG.kraken.colors.ink, life: 1.1, size0: 30, size1: 70, speed: 120, up: 50, gravity: -10, drag: 2 },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Opacity per draw layer. Smoke and dust are see-through so trails never hide units behind them. */
/** `murk`: the Wendigo's dark smoke and mist, dense enough to read as dark over light ground. */
/** `cloud`: the intro's crater cloud: where it is thick it hides what is inside; where thin, a dark shape looms through. */
/** `splash`: water spray, opaque, in its own small pool so fire, debris and sparks filling `solid` never starve it. */
/** `trail` holds contrails on their own, so a long chemtrail never crowds out footfall and impact dust. */
const LAYER_OPACITY = { solid: 1, dust: 0.65, smoke: 0.35, murk: 0.85, cloud: 0.6, splash: 1, trail: 0.8 } as const;
type LayerName = keyof typeof LAYER_OPACITY;
const LAYER_OF: Record<ParticleKind, LayerName> = { dust: 'dust', smoke: 'smoke', debris: 'solid', fire: 'solid', spark: 'solid', acid: 'solid', plasma: 'solid', trail: 'dust', ink: 'smoke', rot: 'solid', shade: 'murk', mist: 'murk', bone: 'solid', wisp: 'dust', hexfire: 'solid', hexember: 'solid', wraith: 'murk', billow: 'dust', veil: 'cloud', splash: 'splash', napalm: 'solid', ember: 'solid', contrail: 'trail' };
const LAYER_MAX: Record<LayerName, number> = { solid: 500, dust: 400, smoke: 500, murk: 400, cloud: 160, splash: 200, trail: 300 };

/** One pooled InstancedMesh: swap-remove on death, no per-frame allocation. */
class Layer {
  private mesh: THREE.InstancedMesh;
  private n = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private kind: ParticleKind[];
  /** Per-particle opacity (layers built with `alpha` only). */
  private alpha: THREE.InstancedBufferAttribute | null = null;

  constructor(
    scene: THREE.Scene,
    geo: THREE.BufferGeometry,
    opacity: number,
    private max: number,
    alpha = false,
  ) {
    const transparent = opacity < 1;
    const mat = new THREE.MeshBasicMaterial({ transparent, opacity, depthWrite: !transparent });
    if (alpha) {
      // Each particle's opacity comes from an instance attribute, multiplied into the material's.
      geo = geo.clone();
      this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(1), 1);
      geo.setAttribute('instanceOpacity', this.alpha);
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float instanceOpacity;\nvarying float vInstanceOpacity;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceOpacity = instanceOpacity;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vInstanceOpacity;')
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vInstanceOpacity );');
      };
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = transparent ? 1 : 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.kind = new Array(max).fill('dust');
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, HIDDEN);
      this.mesh.setColorAt(i, _c.setHex(0xffffff));
    }
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  full(): boolean {
    return this.n >= this.max;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  /** A particle held `hold` s before it starts to age (it stays at its starting size until then). */
  spawn(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, hold = 0): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    const o = i * 3;
    this.pos[o] = x;
    this.pos[o + 1] = y;
    this.pos[o + 2] = z;
    this.vel[o] = vx;
    this.vel[o + 1] = vy;
    this.vel[o + 2] = vz;
    this.age[i] = -hold;
    this.kind[i] = kind;
    this.mesh.setColorAt(i, _c.setHex(PRESETS[kind].color));
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      const p = PRESETS[this.kind[i]!];
      const age = (this.age[i]! += dt);
      if (age >= p.life) {
        this.swapRemove(i);
        continue;
      }
      const o = i * 3;
      const damp = Math.exp(-p.drag * dt);
      this.vel[o] = this.vel[o]! * damp;
      this.vel[o + 1] = this.vel[o + 1]! * damp - p.gravity * dt;
      this.vel[o + 2] = this.vel[o + 2]! * damp;
      this.pos[o] = this.pos[o]! + this.vel[o]! * dt;
      this.pos[o + 1] = Math.max(0, this.pos[o + 1]! + this.vel[o + 1]! * dt);
      this.pos[o + 2] = this.pos[o + 2]! + this.vel[o + 2]! * dt;
      const k = Math.max(0, age) / p.life;
      _s.setScalar(p.size0 + (p.size1 - p.size0) * k);
      const f = p.fadeFrom ?? 0.75;
      const fade = k > f ? (1 - k) / (1 - f) : 1;
      // On a layer with per-particle opacity, particles that don't fade by it are kept fully opaque.
      if (this.alpha) this.alpha.setX(i, p.fadeAlpha ? fade : 1);
      if (!(p.fadeAlpha && this.alpha) && !p.grows) _s.multiplyScalar(fade);
      if (p.stretch) {
        // Flame tongue: upright, tall, its width flickering.
        _s.x *= 0.75 + 0.35 * Math.sin(age * 37 + i);
        _s.y *= p.stretch;
        _q.set(0, Math.sin(i * 1.7), 0, 1).normalize();
      } else _q.set(age, age * 0.7, 0, 1).normalize();
      _m.compose(_p.set(this.pos[o]!, this.pos[o + 1]!, this.pos[o + 2]!), _q, _s);
      this.mesh.setMatrixAt(i, _m);
      i++;
    }
    this.mesh.count = this.n;
    // An empty layer is skipped outright (no zero-instance draw call).
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.alpha) this.alpha.needsUpdate = true;
  }

  private swapRemove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.age[i] = this.age[last]!;
    this.kind[i] = this.kind[last]!;
    this.mesh.setColorAt(i, _c.setHex(PRESETS[this.kind[i]!].color));
  }
}

/** Chunky puffs, drawn in layers (solid, dust, smoke, murk, cloud, splash) so see-through effects blend over solid ones. */
export class Particles {
  private layers: Record<LayerName, Layer>;

  constructor(scene: THREE.Scene) {
    const geo = faceted(new THREE.IcosahedronGeometry(0.5, 0));
    this.layers = {
      solid: new Layer(scene, geo, LAYER_OPACITY.solid, LAYER_MAX.solid),
      dust: new Layer(scene, geo, LAYER_OPACITY.dust, LAYER_MAX.dust, true),
      smoke: new Layer(scene, geo, LAYER_OPACITY.smoke, LAYER_MAX.smoke, true),
      murk: new Layer(scene, geo, LAYER_OPACITY.murk, LAYER_MAX.murk),
      cloud: new Layer(scene, geo, LAYER_OPACITY.cloud, LAYER_MAX.cloud),
      splash: new Layer(scene, geo, LAYER_OPACITY.splash, LAYER_MAX.splash),
      trail: new Layer(scene, geo, LAYER_OPACITY.trail, LAYER_MAX.trail, true),
    };
  }

  clear(): void {
    for (const l of Object.values(this.layers)) l.clear();
  }

  /** `hold`: seconds each particle waits before it starts to grow and fade. */
  emit(kind: ParticleKind, at: THREE.Vector3, count: number, spread = 1, hold = 0): void {
    const p = PRESETS[kind];
    const layer = this.layers[LAYER_OF[kind]];
    for (let k = 0; k < count && !layer.full(); k++) {
      const a = Math.random() * Math.PI * 2;
      const s = p.speed * spread * (0.4 + Math.random() * 0.6);
      layer.spawn(kind, at.x, at.y, at.z, Math.cos(a) * s, p.up * (0.5 + Math.random()), Math.sin(a) * s, hold);
    }
  }

  /** Outward ring along the ground, used for foot landings and stomps. */
  ring(kind: ParticleKind, center: THREE.Vector3, radius: number, count: number): void {
    const p = PRESETS[kind];
    const layer = this.layers[LAYER_OF[kind]];
    for (let k = 0; k < count && !layer.full(); k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.3;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      layer.spawn(kind, center.x + cx * radius * 0.5, center.y + 4, center.z + cz * radius * 0.5, cx * p.speed * 1.4, p.up * 0.3, cz * p.speed * 1.4);
    }
  }

  explosion(at: THREE.Vector3, scale: number): void {
    this.emit('fire', at, Math.round(10 * scale), scale);
    this.emit('smoke', at, Math.round(6 * scale), scale);
    this.emit('debris', at, Math.round(6 * scale), scale);
    this.emit('spark', at, Math.round(6 * scale), scale);
  }

  update(dt: number): void {
    for (const l of Object.values(this.layers)) l.update(dt);
  }
}
