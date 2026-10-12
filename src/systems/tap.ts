import { CONFIG } from '../config';

export type Gesture = 'pending' | 'tap' | 'drag' | 'none';

export function classifyGesture(movedPx: number, elapsedMs: number, released: boolean): Gesture {
  if (movedPx > CONFIG.input.tapMaxMovePx) return 'drag';
  if (!released) return 'pending';
  return elapsedMs <= CONFIG.input.tapMaxMs ? 'tap' : 'none';
}

export type ScreenPoint = { index: number; x: number; y: number; visible: boolean };

/** Nearest visible screen point within radiusPx of (x, y). Generous radius makes tiny targets tappable on phones. */
export function pickEnemy(points: ScreenPoint[], x: number, y: number, radiusPx: number): number | null {
  let best: number | null = null;
  let bestD = radiusPx;
  for (const p of points) {
    if (!p.visible) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) {
      bestD = d;
      best = p.index;
    }
  }
  return best;
}
