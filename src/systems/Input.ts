import { abilityKey, canTap, classifyGesture } from './tap';

export type InputHandlers = {
  tap(x: number, y: number): void;
  drag(dx: number, dy: number): void;
  hover(x: number, y: number): void;
  wheel(deltaY: number): void;
  /** Ability key pressed; return true when the game used it (then the browser default is suppressed). */
  key(id: 'leap' | 'dash' | 'roar'): boolean | void;
};

/** Single-pointer gesture handling over the canvas. Touch and mouse share one path; hover and wheel are mouse-only. */
export class Input {
  private activeId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private startT = 0;
  private dragging = false;
  private tapAllowed = true;

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKey);
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown = (e: PointerEvent) => {
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    [this.startX, this.startY] = this.local(e);
    this.lastX = this.startX;
    this.lastY = this.startY;
    this.startT = performance.now();
    this.dragging = false;
    this.tapAllowed = canTap(e.pointerType, e.button);
  };

  private onMove = (e: PointerEvent) => {
    const [x, y] = this.local(e);
    if (this.activeId === null) {
      if (e.pointerType === 'mouse') this.h.hover(x, y);
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
    if (e.pointerId !== this.activeId) return;
    const [x, y] = this.local(e);
    const moved = Math.hypot(x - this.startX, y - this.startY);
    if (this.tapAllowed && !this.dragging && classifyGesture(moved, performance.now() - this.startT, true) === 'tap') this.h.tap(x, y);
    this.activeId = null;
    this.dragging = false;
  };

  private onCancel = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    this.dragging = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.h.wheel(e.deltaY);
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  private onKey = (e: KeyboardEvent) => {
    const id = abilityKey(e);
    if (!id) return;
    if (this.h.key(id)) e.preventDefault();
  };

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onCancel);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKey);
  }
}
