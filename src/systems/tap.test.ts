import { describe, it, expect } from 'vitest';
import { classifyGesture, pickEnemy } from './tap';

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
