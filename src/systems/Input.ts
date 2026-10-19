import { KonamiTracker } from './konami';
import { abilityKey, canTap, classifyGesture, driveAxes, driveKey, isSkipKey, menuKey, numberKey, pinchToWheel, isEscKey, type DriveKey } from './tap';

export type InputHandlers = {
  tap(x: number, y: number): void;
  drag(dx: number, dy: number): void;
  hover(x: number, y: number): void;
  wheel(deltaY: number): void;
  /** Ability key pressed; return true when the game used it (then the browser default is suppressed). */
  key(id: 'leap' | 'dash' | 'roar'): boolean | void;
  /** A plain key press; return true when it skipped the intro (then it isn't also an ability key). */
  skipKey(): boolean;
  /** Browse/confirm key (select screen, level-up cards); return true when the menu used it. */
  menuKey(k: 'left' | 'right' | 'confirm'): boolean;
  /** Number key 1–9 as a 0-based index (level-up cards); return true when it picked a card. */
  numberKey(i: number): boolean;
  /** Escape pressed; return true when it opened or closed the pause menu. */
  escape(): boolean;
  /** The Konami code was just completed. */
  konami(): void;
  };

/**
 * Gesture handling over the canvas. One pointer taps or drags (touch and mouse share this path);
 * two touch pointers pinch to zoom. Hover and wheel are mouse-only.
 */
export class Input {
  private activeId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private startT = 0;
  private dragging = false;
  private tapAllowed = true;
  /** Every pointer currently down, by id (CSS px relative to the element). */
  private down = new Map<number, { x: number; y: number }>();
  /** Set once a second finger lands; cleared only when all fingers lift, so a pinch never ends in a tap or drag. */
  private pinching = false;
  private pinchDist = 0;
  private konami = new KonamiTracker();
  /** Walking keys held down (WASD / arrows). */
  private held = new Set<DriveKey>();

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** The held walking keys as axes: throttle +1 forward / −1 back, turn +1 left / −1 right. */
  drive(): { throttle: number; turn: number } {
    return driveAxes(this.held);
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /** Distance between the first two pointers that are down. */
  private spread(): number {
    const [a, b] = [...this.down.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private onDown = (e: PointerEvent) => {
    const [x, y] = this.local(e);
    this.down.set(e.pointerId, { x, y });
    this.el.setPointerCapture(e.pointerId);
    if (this.down.size >= 2) {
      this.pinching = true;
      this.dragging = false;
      this.pinchDist = this.spread();
      return;
    }
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.startX = this.lastX = x;
    this.startY = this.lastY = y;
    this.startT = performance.now();
    this.dragging = false;
    this.tapAllowed = canTap(e.pointerType, e.button);
  };

  private onMove = (e: PointerEvent) => {
    const [x, y] = this.local(e);
    if (this.down.size === 0) {
      if (e.pointerType === 'mouse') this.h.hover(x, y);
      return;
    }
    if (!this.down.has(e.pointerId)) return;
    this.down.set(e.pointerId, { x, y });
    if (this.pinching) {
      if (this.down.size >= 2) {
        const d = this.spread();
        this.h.wheel(pinchToWheel(this.pinchDist, d));
        this.pinchDist = d;
      }
      return;
    }
    if (e.pointerId !== this.activeId) return;
    if (!this.dragging) {
      const moved = Math.hypot(x - this.startX, y - this.startY);
      this.dragging = classifyGesture(moved, performance.now() - this.startT, false) === 'drag';
    }
    if (this.dragging) this.h.drag(x - this.lastX, y - this.lastY);
    this.lastX = x;
    this.lastY = y;
  };

  private onUp = (e: PointerEvent) => {
    if (!this.down.delete(e.pointerId)) return;
    if (this.pinching) {
      if (this.down.size >= 2) this.pinchDist = this.spread();
      if (this.down.size === 0) {
        this.pinching = false;
        this.activeId = null;
        this.dragging = false;
      }
      return;
    }
    if (e.pointerId !== this.activeId) return;
    const [x, y] = this.local(e);
    const moved = Math.hypot(x - this.startX, y - this.startY);
    if (e.type === 'pointerup' && this.tapAllowed && !this.dragging && classifyGesture(moved, performance.now() - this.startT, true) === 'tap') this.h.tap(x, y);
    this.activeId = null;
    this.dragging = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.h.wheel(e.deltaY);
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  private onKey = (e: KeyboardEvent) => {
    const dk = driveKey(e.code);
    if (dk && !e.metaKey && !e.ctrlKey && !e.altKey) this.held.add(dk);
    if (!e.metaKey && !e.ctrlKey && !e.altKey && this.konami.push(e)) this.h.konami();
    if (isEscKey(e) && this.h.escape()) {
      e.preventDefault();
      return;
    }
    const mk = menuKey(e);
    if (mk && this.h.menuKey(mk)) {
      e.preventDefault();
      return;
    }
    const nk = numberKey(e);
    if (nk !== null && this.h.numberKey(nk)) {
      e.preventDefault();
      return;
    }
    if (isSkipKey(e) && this.h.skipKey()) {
      e.preventDefault();
      return;
    }
    const id = abilityKey(e);
    if (!id) return;
    if (this.h.key(id)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const dk = driveKey(e.code);
    if (dk) this.held.delete(dk);
  };

  /** Key-ups are lost while the window is unfocused, so leaving it lets go of every key. */
  private onBlur = () => this.held.clear();

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
