import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { BodyFrame } from '../types';
import { InsectBody } from './InsectBody';

const base = (): BodyFrame => ({
  dt: 1 / 60, time: 0, cycle: 0, prevCycle: 0, motion: 0, pose: { dip: 0, pitch: 0, collapse: 0 },
  melee: null, antiAir: null, roaring: false, roarDuration: 1.2, airborne: false, carried: false, brace: 0, blaze: 0, roar: 0, dashing: false,
  tailSweep: null, lookAt: null, charge: 0, heat: 0, flash: false, glow: 0,
});

describe('InsectBody for Spike Rain', () => {
  it('held for Spike Rain it stands up like a threatened spider: lifted, front tilted up a little, on its back pair', () => {
    const pose = (roar: number) => {
      const body = new InsectBody();
      for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, carried: true, roar }, () => {});
      return body;
    };
    const up = pose(1);
    const down = pose(0);
    const tilt = down['model'].body.rotation.x - up['model'].body.rotation.x;
    expect(tilt).toBeGreaterThan(0.4);
    expect(tilt).toBeLessThan(0.7);
    expect(up['model'].body.position.y).toBeGreaterThan(down['model'].body.position.y + 80);
    for (let i = 0; i < 4; i++) expect(up.feet[i]!.y).toBeGreaterThanOrEqual(150);
    expect(Math.abs(up.feet[4]!.y)).toBeLessThan(10);
    expect(Math.abs(up.feet[5]!.y)).toBeLessThan(10);
  });

  it('stands tall on its back legs: they straighten to most of their length', () => {
    const reach = (roar: number) => {
      const body = new InsectBody();
      for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, carried: true, roar }, () => {});
      const m = body['model'];
      return [4, 5].map((i) => m.legs[i]!.hipLocal.clone().applyMatrix4(m.body.matrix).distanceTo(body.feet[i]!) / 700);
    };
    for (const r of reach(1)) expect(r).toBeGreaterThanOrEqual(0.8);
    for (const r of reach(0)) expect(r).toBeLessThan(0.75);
  });

  it('the raised legs move only at the knee: the upper leg holds still while the lower leg kicks', () => {
    const body = new InsectBody();
    for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, carried: true, roar: 1 }, () => {});
    const m = body['model'];
    const femur = (k: number) => {
      const hip = m.legs[k]!.hipLocal.clone().applyMatrix4(m.body.matrix);
      return m.legs[k]!.knee.position.clone().sub(hip).normalize();
    };
    const start = [0, 1, 2, 3].map(femur);
    const feet0 = body.feet.slice(0, 4).map((f) => f.clone());
    let moved = 0;
    for (let i = 30; i < 210; i++) {
      body.animate({ ...base(), time: i / 60, carried: true, roar: 1 }, () => {});
      for (let k = 0; k < 4; k++) {
        expect(femur(k).angleTo(start[k]!)).toBeLessThan(0.02);
        moved = Math.max(moved, body.feet[k]!.distanceTo(feet0[k]!));
      }
    }
    expect(moved).toBeGreaterThan(100);
  });

  it('the raised legs kick out slowly now and then, each at its own moment', () => {
    const body = new InsectBody();
    const paths: THREE.Vector3[][] = [[], [], [], []];
    for (let i = 0; i < 180; i++) {
      body.animate({ ...base(), time: i / 60, carried: true, roar: 1 }, () => {});
      for (let k = 0; k < 4; k++) paths[k]!.push(body.feet[k]!.clone());
    }
    const peaks = new Set<number>();
    for (const path of paths) {
      const from = path[0]!;
      const far = path.map((p) => p.distanceTo(from));
      expect(Math.max(...far)).toBeGreaterThanOrEqual(100);
      for (let i = 1; i < path.length; i++) expect(path[i]!.distanceTo(path[i - 1]!)).toBeLessThan(15);
      for (const p of path) expect(p.y).toBeGreaterThan(150);
      // When it reaches furthest out from the body's middle.
      const out = path.map((p) => Math.hypot(p.x, p.z));
      peaks.add(Math.round(out.indexOf(Math.max(...out)) / 6));
    }
    expect(peaks.size).toBeGreaterThanOrEqual(3);
  });

  it('braces with its tail: held straight out behind and down, its tip on the ground', () => {
    const tail = (carried: boolean) => {
      const body = new InsectBody();
      for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, carried, roar: 1 }, () => {});
      const m = body['model'];
      return (m['tailPts'] as THREE.Vector3[]).map((p) => p.clone().applyMatrix4(m.body.matrix));
    };
    const pts = tail(true);
    const root = pts[0]!;
    const tip = pts[pts.length - 1]!;
    expect(tip.y).toBeLessThan(40);
    expect(tip.z).toBeLessThan(root.z - 300);
    const line = new THREE.Line3(root, tip);
    const on = new THREE.Vector3();
    for (const p of pts) expect(p.distanceTo(line.closestPointToPoint(p, true, on))).toBeLessThan(10);
    // Not held: the tail as it always is, up off the ground.
    const free = tail(false);
    expect(free[free.length - 1]!.y).toBeGreaterThan(200);
  });

  it('its front pair is raised high above its head and spread wide; the second pair held out lower', () => {
    const body = new InsectBody();
    for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, carried: true, roar: 1 }, () => {});
    const head = body.root.worldToLocal(body.sprayFrom(new THREE.Vector3()));
    for (const i of [0, 1]) {
      expect(body.feet[i]!.y).toBeGreaterThan(head.y + 100);
      expect(Math.abs(body.feet[i]!.x)).toBeGreaterThan(300);
    }
    for (const i of [2, 3]) {
      expect(body.feet[i]!.y).toBeLessThan(Math.min(body.feet[0]!.y, body.feet[1]!.y));
      expect(Math.abs(body.feet[i]!.x)).toBeGreaterThan(300);
    }
  });

  it('the raised legs wave slowly and quiver, staying raised', () => {
    const body = new InsectBody();
    const ys: number[] = [];
    const xs: number[] = [];
    for (let i = 0; i < 120; i++) {
      body.animate({ ...base(), time: i / 60, carried: true, roar: 1 }, () => {});
      ys.push(body.feet[0]!.y);
      xs.push(body.feet[0]!.x);
    }
    expect(Math.max(...ys) - Math.min(...ys) + Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30);
    expect(Math.min(...ys)).toBeGreaterThan(300);
    // Slow: it never jumps far in one frame.
    for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i]! - ys[i - 1]!)).toBeLessThan(15);
  });

  it('its mouth is at the front of the head, between the mandibles, ahead of the stinger curled over its back', () => {
    const body = new InsectBody();
    body.animate(base(), () => {});
    const mouth = body.root.worldToLocal(body.sprayFrom(new THREE.Vector3()));
    const stinger = body.root.worldToLocal(body.rangedOrigin(new THREE.Vector3()));
    expect(Math.abs(mouth.x)).toBeLessThan(5);
    expect(mouth.z).toBeGreaterThan(stinger.z + 100);
    expect(mouth.y).toBeGreaterThan(100);
  });

  it('held for Spike Rain, its mandibles open wide', () => {
    const body = new InsectBody();
    body.animate({ ...base(), carried: true, roar: 1 }, () => {});
    expect(Math.abs(body['model'].mandibles[0]!.rotation.y)).toBeGreaterThanOrEqual(0.5);
  });

  it('not carried, nothing changes', () => {
    const body = new InsectBody();
    for (let i = 0; i < 30; i++) body.animate({ ...base(), time: i / 60, roar: 1 }, () => {});
    for (let i = 0; i < 4; i++) expect(Math.abs(body.feet[i]!.y)).toBeLessThan(10);
  });

});

describe('InsectBody tail aim', () => {
  const look = (bearing: number) => new THREE.Vector3(Math.sin(bearing) * 1200, 0, Math.cos(bearing) * 1200);
  const aimDir = (body: InsectBody) => {
    const m = body['model'];
    return body['aim'].clone().sub(m.tailRoot).normalize();
  };

  it('swings to a new target at no more than tailTurnRate, never jumping', () => {
    const body = new InsectBody();
    for (let i = 0; i < 120; i++) body.animate({ ...base(), time: i / 60, lookAt: look(0.9) }, () => {});
    let prev = aimDir(body);
    let worst = 0;
    for (let i = 120; i < 240; i++) {
      body.animate({ ...base(), time: i / 60, lookAt: look(-0.9) }, () => {});
      const d = aimDir(body);
      worst = Math.max(worst, d.angleTo(prev));
      prev = d;
    }
    expect(worst).toBeLessThanOrEqual(CONFIG.monster.tailTurnRate / 60 + 1e-6);
  });

  it('reports how far the tail still is from its target: off while swinging, on once there', () => {
    const body = new InsectBody();
    for (let i = 0; i < 120; i++) body.animate({ ...base(), time: i / 60, lookAt: look(0.9) }, () => {});
    expect(body.aimError()).toBeLessThan(CONFIG.monster.tailAimTolerance);
    body.animate({ ...base(), time: 2, lookAt: look(-0.9) }, () => {});
    expect(body.aimError()).toBeGreaterThan(0.5);
  });
});
