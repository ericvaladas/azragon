import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config';
import { CRATER_RADIUS } from '../world/City';
import * as THREE from 'three';
import { Particles, PRESETS } from './Particles';

describe('veil (the cloud that hides the crater after impact)', () => {
  const S = CONFIG.intro.starts;
  const R = CONFIG.intro.reveal;
  const V = PRESETS.veil;
  it('is mostly fed in after the first burst, so it thins gradually (in the order it was fed) rather than all at once', () => {
    expect(R.feedRate * R.feedFor).toBeGreaterThan(R.cloud);
  });
  it('is solid for a second after impact, then thins over a long stretch, so the dark figure shows through it early', () => {
    const thin = S.impact + V.life * (V.fadeFrom ?? 0.75);
    expect(thin).toBeGreaterThanOrEqual(S.impact + 1);
    expect(thin).toBeLessThanOrEqual(S.impact + 1.5);
    expect(V.fadeFrom).toBeLessThanOrEqual(0.45);
  });
  it('the last puffs fed into it are gone by the time play starts, after the colour has come back', () => {
    const last = S.impact + R.feedFor + V.life;
    expect(last).toBeLessThanOrEqual(S.done);
    expect(last).toBeGreaterThanOrEqual(S.emerge + R.hold + R.fade - 0.3);
  });
  it('is dense: drawn more opaque than plain dust, and big enough to swallow a cocoon seen from ~2 km', () => {
    expect(V.size0).toBeGreaterThan(200);
    expect(R.cloud + R.feedRate * R.feedFor).toBeGreaterThanOrEqual(50);
  });
});

describe('billow (the pod crash dust cloud)', () => {
  it('is big enough to read from the cutscene camera ~2 km up and lingers well past the impact flash', () => {
    const b = PRESETS.billow;
    expect(b.size1).toBeGreaterThan(CRATER_RADIUS * 0.6);
    expect(b.size0).toBeGreaterThan(PRESETS.dust.size1 * 2);
    expect(b.life).toBeGreaterThan(CONFIG.intro.flash.impactFade + 1);
    // ...but it has cleared by the time the cocoon splits, so the monster climbing out is never hidden.
    expect(CONFIG.intro.starts.impact + b.life).toBeLessThan(CONFIG.intro.starts.emerge);
    // It rolls out along the ground rather than falling.
    expect(b.gravity).toBeLessThanOrEqual(0);
  });
});

describe('splash layer', () => {
  const counts = (scene: THREE.Scene) =>
    scene.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh).map((m) => m.count).filter((n) => n > 0).sort((a, b) => a - b);
  it('has its own 200-particle cap, so a full solid layer (fire, debris, sparks) never starves splashes', () => {
    const scene = new THREE.Scene();
    const fx = new Particles(scene);
    const at = new THREE.Vector3();
    fx.emit('fire', at, 1000);
    fx.emit('splash', at, 1000);
    fx.update(0.001);
    expect(counts(scene)).toEqual([200, 500]);
  });
});

describe('Particles hold', () => {
  it('a held particle starts ageing only once its hold runs out', () => {
    const scene = new THREE.Scene();
    const p = new Particles(scene);
    const live = () => scene.children.reduce((n, m) => n + (m as THREE.InstancedMesh).count, 0);
    p.emit('contrail', new THREE.Vector3(), 1, 0, 1);
    p.update(PRESETS.contrail.life + 0.5);
    expect(live()).toBe(1);
    p.update(0.6);
    expect(live()).toBe(0);
  });
});

describe('smoke fade', () => {
  /** The layer mesh holding the one live particle, and its per-particle opacity. */
  const liveLayer = (scene: THREE.Scene) => {
    const mesh = scene.children.find((m) => (m as THREE.InstancedMesh).count > 0) as THREE.InstancedMesh;
    return { mesh, alpha: mesh.geometry.getAttribute('instanceOpacity') as THREE.InstancedBufferAttribute | undefined };
  };

  it('smoke, shell trails and contrails fade out by turning transparent while they keep growing', () => {
    for (const kind of ['smoke', 'trail', 'contrail'] as const) {
      const scene = new THREE.Scene();
      const p = new Particles(scene);
      p.emit(kind, new THREE.Vector3(), 1, 0);
      let last = 1;
      for (let t = 0; t < PRESETS[kind].life - 0.05; t += 0.05) {
        p.update(0.05);
        const { alpha } = liveLayer(scene);
        expect(alpha).toBeDefined();
        expect(alpha!.getX(0)).toBeLessThanOrEqual(last + 1e-6);
        last = alpha!.getX(0);
      }
      expect(last).toBeLessThan(0.15);
    }
  });

  it('a shrinking particle on a fading layer stays fully opaque', () => {
    const scene = new THREE.Scene();
    const p = new Particles(scene);
    p.emit('dust', new THREE.Vector3(), 1, 0);
    for (let t = 0; t < PRESETS.dust.life - 0.05; t += 0.05) {
      p.update(0.05);
      expect(liveLayer(scene).alpha!.getX(0)).toBe(1);
    }
  });
});

describe('smoke growth', () => {
  it('smoke, shell trails and contrails keep growing until they vanish, never shrinking', () => {
    for (const kind of ['smoke', 'trail', 'contrail'] as const) {
      const scene = new THREE.Scene();
      const p = new Particles(scene);
      p.emit(kind, new THREE.Vector3(), 1, 0);
      const live = () => scene.children.find((c) => (c as THREE.InstancedMesh).count > 0) as THREE.InstancedMesh | undefined;
      const m = new THREE.Matrix4();
      const s = new THREE.Vector3();
      let last = 0;
      for (let t = 0; t < PRESETS[kind].life - 0.05; t += 0.05) {
        p.update(0.05);
        live()!.getMatrixAt(0, m);
        s.setFromMatrixScale(m);
        expect(s.x).toBeGreaterThanOrEqual(last - 1e-6);
        last = s.x;
      }
      expect(last).toBeGreaterThan(PRESETS[kind].size1 * 0.9);
    }
  });
});

describe('contrail', () => {
  it('is a pale puff that outlasts the shell flight and spreads as it fades', () => {
    const c = PRESETS.contrail;
    expect(c.life).toBeGreaterThan(CONFIG.gustav.range / CONFIG.gustav.shellSpeed);
    expect(c.size1).toBeGreaterThan(c.size0 * 2);
    expect(c.gravity).toBe(0);
  });
});
