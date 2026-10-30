import type { ActiveId } from './abilities';
import { CONFIG } from '../config';

export type Gesture = 'pending' | 'tap' | 'drag' | 'none';

export function classifyGesture(movedPx: number, elapsedMs: number, released: boolean): Gesture {
  if (movedPx > CONFIG.input.tapMaxMovePx) return 'drag';
  if (!released) return 'pending';
  return elapsedMs <= CONFIG.input.tapMaxMs ? 'tap' : 'none';
}

/** Mouse taps come only from the primary button; right/middle buttons are for orbiting. Touch and pen always tap. */
export function canTap(pointerType: string, button: number): boolean {
  return pointerType !== 'mouse' || button === 0;
}

/** An enemy on screen: its centre (px), whether it is pickable, and `r`, how far (px) it visibly extends from its centre. */
export type ScreenPoint = { index: number; x: number; y: number; visible: boolean; r?: number };

/**
 * The visible screen point whose pick zone holds (x, y): each zone is the larger of `radiusPx` (so tiny targets stay
 * tappable on phones) and the target's own on-screen size `r` (so a click anywhere on a big blimp counts). Where
 * zones overlap, the target whose centre is relatively closest wins.
 */
export function pickEnemy(points: ScreenPoint[], x: number, y: number, radiusPx: number): number | null {
  let best: number | null = null;
  let bestScore = 1;
  for (const p of points) {
    if (!p.visible) continue;
    const score = Math.hypot(p.x - x, p.y - y) / Math.max(radiusPx, p.r ?? 0);
    if (score <= bestScore) {
      bestScore = score;
      best = p.index;
    }
  }
  return best;
}

/** Ability for a keydown: Space = Leap, E = Dash, R = Roar. Modified keys (Cmd/Ctrl/Alt) and repeats are left to the browser. */
export function abilityKey(e: { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): ActiveId | null {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.code === 'Space') return 'leap';
  if (e.code === 'KeyE') return 'dash';
  if (e.code === 'KeyR') return 'roar';
  if (e.code === 'KeyT') return 'bubble';
  if (e.code === 'KeyQ') return 'ultimate';
  return null;
}

export type DriveKey = 'forward' | 'back' | 'left' | 'right';

/** Walking keys, by position (so AZERTY and Dvorak keep the WASD shape): W/↑ forward, S/↓ back, A/← and D/→ turn. */
export function driveKey(code: string): DriveKey | null {
  if (code === 'KeyW' || code === 'ArrowUp') return 'forward';
  if (code === 'KeyS' || code === 'ArrowDown') return 'back';
  if (code === 'KeyA' || code === 'ArrowLeft') return 'left';
  if (code === 'KeyD' || code === 'ArrowRight') return 'right';
  return null;
}

/** Held walking keys as axes: throttle +1 forward / −1 back, turn +1 left (yaw grows toward +X, the left) / −1 right. */
export function driveAxes(held: ReadonlySet<DriveKey>): { throttle: number; turn: number } {
  return {
    throttle: (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0),
    turn: (held.has('left') ? 1 : 0) - (held.has('right') ? 1 : 0),
  };
}

/** Wheel-equivalent zoom for a pinch: fingers moving apart zoom in (negative), together zoom out. */
export function pinchToWheel(prevDist: number, curDist: number): number {
  return (prevDist - curDist) * CONFIG.input.pinchSensitivity;
}

const NOT_SKIP = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock', 'ContextMenu']);
/** Function keys belong to the browser (F5 reload, F11 fullscreen, F12 devtools). */
const FUNCTION_KEY = /^F\d{1,2}$/;

/** Any plain key press skips the intro; browser shortcuts (Cmd+R…), repeats, lone modifiers, and function keys don't. */
export function isSkipKey(e: { key: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !NOT_SKIP.has(e.key) && !FUNCTION_KEY.test(e.key);
}

/** The pause-menu key: Escape on its own (not held down, no modifier). */
export function isEscKey(e: { key: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return e.key === 'Escape' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/** A numbered choice (the level-up cards): 1–9 on the number row or keypad gives its 0-based index; no repeats or shortcuts. */
export function numberKey(e: { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): number | null {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return null;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return m ? Number(m[1]) - 1 : null;
}

/** Select-screen keys: browse with arrows (or A/D), confirm with Enter/Space; no repeats or shortcuts. */
export function menuKey(e: { code: string; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): 'left' | 'right' | 'confirm' | null {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') return 'left';
  if (e.code === 'ArrowRight' || e.code === 'KeyD') return 'right';
  if (e.code === 'Enter' || e.code === 'Space') return 'confirm';
  return null;
}
