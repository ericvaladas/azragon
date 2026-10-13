/** Up Up Down Down Left Right Left Right B A, as KeyboardEvent.code values. */
export const KONAMI: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

/** Watches keydowns for the Konami code; `push` returns true on the key that completes it. Repeats are ignored. */
export class KonamiTracker {
  private matched = 0;

  push(e: { code: string; repeat: boolean }): boolean {
    if (e.repeat) return false;
    if (e.code === KONAMI[this.matched]) this.matched++;
    // A miss restarts the match; an Up can itself begin a new attempt, and a third Up keeps the two before it.
    else this.matched = e.code === KONAMI[0] ? (this.matched === 2 ? 2 : 1) : 0;
    if (this.matched < KONAMI.length) return false;
    this.matched = 0;
    return true;
  }
}
