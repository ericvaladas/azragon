import { describe, it, expect } from 'vitest';
import { abilityKey, classifyGesture, pickEnemy, canTap, pinchToWheel, isSkipKey } from './tap';
import { CONFIG } from '../config';

describe('classifyGesture', () => {
  it('short, still release is a tap', () => {
    expect(classifyGesture(3, 120, true)).toBe('tap');
  });
  it('moving past the threshold is a drag, even before release', () => {
    expect(classifyGesture(25, 50, false)).toBe('drag');
    expect(classifyGesture(25, 50, true)).toBe('drag');
  });
  it('a long still press is neither', () => {
    expect(classifyGesture(2, 900, true)).toBe('none');
  });
  it('still and held is pending', () => {
    expect(classifyGesture(2, 100, false)).toBe('pending');
  });
});

describe('pickEnemy', () => {
  const pts = [
    { index: 0, x: 100, y: 100, visible: true },
    { index: 1, x: 120, y: 100, visible: true },
    { index: 2, x: 105, y: 102, visible: false },
  ];
  it('picks the nearest visible point within the radius', () => {
    expect(pickEnemy(pts, 112, 100, 28)).toBe(1);
    expect(pickEnemy(pts, 101, 100, 28)).toBe(0);
  });
  it('ignores points behind the camera / off-screen', () => {
    expect(pickEnemy([pts[2]!], 105, 102, 28)).toBeNull();
  });
  it('returns null when nothing is close enough', () => {
    expect(pickEnemy(pts, 300, 300, 28)).toBeNull();
  });
});

describe('canTap', () => {
  it('only the primary mouse button taps; right/middle are drag-only', () => {
    expect(canTap('mouse', 0)).toBe(true);
    expect(canTap('mouse', 2)).toBe(false);
    expect(canTap('mouse', 1)).toBe(false);
  });
  it('touch and pen always tap', () => {
    expect(canTap('touch', 0)).toBe(true);
    expect(canTap('pen', 0)).toBe(true);
  });
});

describe('abilityKey', () => {
  const k = (code: string, mods: Partial<{ repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
    abilityKey({ code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, ...mods });
  it('maps Space to leap and R to roar', () => {
    expect(k('Space')).toBe('leap');
    expect(k('KeyR')).toBe('roar');
    expect(k('KeyE')).toBe('dash');
  });
  it('leaves browser shortcuts alone (Cmd/Ctrl/Alt+R reload, etc.)', () => {
    expect(k('KeyR', { metaKey: true })).toBeNull();
    expect(k('KeyR', { ctrlKey: true })).toBeNull();
    expect(k('Space', { altKey: true })).toBeNull();
  });
  it('ignores key repeat and other keys', () => {
    expect(k('Space', { repeat: true })).toBeNull();
    expect(k('KeyQ')).toBeNull();
  });
});

describe('pinchToWheel', () => {
  it('spreading fingers zooms in (negative wheel), pinching zooms out (positive)', () => {
    expect(pinchToWheel(100, 160)).toBeLessThan(0);
    expect(pinchToWheel(160, 100)).toBeGreaterThan(0);
    expect(pinchToWheel(120, 120)).toBe(0);
  });
  it('is proportional to the change in finger distance', () => {
    expect(pinchToWheel(100, 160)).toBeCloseTo(-60 * CONFIG.input.pinchSensitivity);
    expect(pinchToWheel(100, 220)).toBeCloseTo(2 * pinchToWheel(100, 160));
  });
});

describe('isSkipKey', () => {
  const k = (key: string, mods: Partial<{ repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
    key,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mods,
  });
  it('skips on any plain key press', () => {
    expect(isSkipKey(k(' '))).toBe(true);
    expect(isSkipKey(k('a'))).toBe(true);
    expect(isSkipKey(k('Enter'))).toBe(true);
    expect(isSkipKey(k('Escape'))).toBe(true);
  });
  it('ignores browser shortcuts, held-key repeats, and lone modifier keys', () => {
    expect(isSkipKey(k('r', { metaKey: true }))).toBe(false);
    expect(isSkipKey(k('r', { ctrlKey: true }))).toBe(false);
    expect(isSkipKey(k('a', { altKey: true }))).toBe(false);
    expect(isSkipKey(k('a', { repeat: true }))).toBe(false);
    for (const m of ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock']) expect(isSkipKey(k(m))).toBe(false);
  });
});
