const START_HINT = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'Tap to start' : 'Click or press any key';

/** Title over the drifting city. Taps fall through to the canvas, which starts the game. */
export function Title() {
  return (
    <div className="title-screen">
      <h1 className="title-logo">AZRAGON</h1>
      <div className="title-hint">{START_HINT}</div>
    </div>
  );
}
