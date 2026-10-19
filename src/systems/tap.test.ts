import { describe, it, expect } from 'vitest';
import { abilityKey, classifyGesture, driveAxes, driveKey, pickEnemy, canTap, pinchToWheel, isSkipKey, menuKey, isEscKey, numberKey } from './tap';
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

describe('pickEnemy on-screen size', () => {
  it('hits anywhere on a target that looks bigger than the minimum radius (a blimp), not just near its centre', () => {
    const blimp = { index: 0, x: 500, y: 100, visible: true, r: 70 };
    expect(pickEnemy([blimp], 560, 100, 28)).toBe(0);
    expect(pickEnemy([blimp], 580, 100, 28)).toBeNull();
  });
  it('keeps the minimum radius for small targets', () => {
    const tank = { index: 0, x: 100, y: 100, visible: true, r: 6 };
    expect(pickEnemy([tank], 125, 100, 28)).toBe(0);
  });
  it('prefers the target whose centre is relatively closer when zones overlap', () => {
    const blimp = { index: 0, x: 100, y: 100, visible: true, r: 80 };
    const heli = { index: 1, x: 160, y: 100, visible: true, r: 10 };
    expect(pickEnemy([blimp, heli], 155, 100, 28)).toBe(1);
    expect(pickEnemy([blimp, heli], 110, 100, 28)).toBe(0);
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
  it('leaves browser function keys alone (F5 reload, F11 fullscreen, F12 devtools)', () => {
    for (const f of ['F1', 'F5', 'F11', 'F12', 'ContextMenu']) expect(isSkipKey(k(f))).toBe(false);
  });
});

describe('menuKey', () => {
  const k = (code: string, mods: Partial<{ repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
    code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, ...mods,
  });
  it('maps arrows/A/D to browse and Enter/Space to confirm', () => {
    expect(menuKey(k('ArrowLeft'))).toBe('left');
    expect(menuKey(k('KeyA'))).toBe('left');
    expect(menuKey(k('ArrowRight'))).toBe('right');
    expect(menuKey(k('KeyD'))).toBe('right');
    expect(menuKey(k('Enter'))).toBe('confirm');
    expect(menuKey(k('Space'))).toBe('confirm');
  });
  it('ignores other keys, repeats, and shortcuts', () => {
    expect(menuKey(k('KeyQ'))).toBeNull();
    expect(menuKey(k('ArrowLeft', { repeat: true }))).toBeNull();
    expect(menuKey(k('ArrowRight', { metaKey: true }))).toBeNull();
    expect(menuKey(k('Enter', { ctrlKey: true }))).toBeNull();
  });
});

describe('numberKey', () => {
  const k = (code: string, mods: Partial<{ repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
    code, repeat: false, metaKey: false, ctrlKey: false, altKey: false, ...mods,
  });
  it('gives the 0-based index of 1–9 on the number row and keypad', () => {
    expect(numberKey(k('Digit1'))).toBe(0);
    expect(numberKey(k('Digit3'))).toBe(2);
    expect(numberKey(k('Numpad2'))).toBe(1);
    expect(numberKey(k('Digit9'))).toBe(8);
  });
  it('ignores 0, other keys, repeats, and shortcuts', () => {
    expect(numberKey(k('Digit0'))).toBeNull();
    expect(numberKey(k('KeyW'))).toBeNull();
    expect(numberKey(k('Digit1', { repeat: true }))).toBeNull();
    expect(numberKey(k('Digit1', { metaKey: true }))).toBeNull();
  });
});

describe('isEscKey', () => {
  const k = (key: string, over: Partial<{ repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({ key, repeat: false, metaKey: false, ctrlKey: false, altKey: false, ...over });
  it('is Escape alone, not held down or with a modifier', () => {
    expect(isEscKey(k('Escape'))).toBe(true);
    expect(isEscKey(k('Escape', { repeat: true }))).toBe(false);
    expect(isEscKey(k('Escape', { metaKey: true }))).toBe(false);
    expect(isEscKey(k('Enter'))).toBe(false);
  });
});

describe('driveKey', () => {
  it('maps WASD and the arrow keys by position', () => {
    expect(['KeyW', 'KeyS', 'KeyA', 'KeyD'].map(driveKey)).toEqual(['forward', 'back', 'left', 'right']);
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(driveKey)).toEqual(['forward', 'back', 'left', 'right']);
    expect(driveKey('KeyE')).toBeNull();
  });
});

describe('driveAxes', () => {
  it('W walks forward, S backward; A turns left (+yaw), D right', () => {
    expect(driveAxes(new Set(['forward']))).toEqual({ throttle: 1, turn: 0 });
    expect(driveAxes(new Set(['back']))).toEqual({ throttle: -1, turn: 0 });
    expect(driveAxes(new Set(['left']))).toEqual({ throttle: 0, turn: 1 });
    expect(driveAxes(new Set(['forward', 'right']))).toEqual({ throttle: 1, turn: -1 });
  });
  it('opposite keys cancel', () => {
    expect(driveAxes(new Set(['forward', 'back', 'left', 'right']))).toEqual({ throttle: 0, turn: 0 });
    expect(driveAxes(new Set())).toEqual({ throttle: 0, turn: 0 });
  });
});
