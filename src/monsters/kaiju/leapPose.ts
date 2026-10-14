/** Seconds after liftoff the legs take to snap straight (the spring). */
const SPRING = 0.16;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

export type KaijuLeapPose = {
  /** How deep the body crouches (1 deep, 0 standing, below 0 stretched up past standing). */
  sink: number;
  /** Extra pitch (rad, + leaning forward). */
  pitch: number;
  /** 0..1: legs pulled up under the body in the air. */
  tuck: number;
  /** Arm swing (rad, + drawn back, − thrown forward). */
  arms: number;
  /** Tail lift (−1 low and braced, + streaming up behind). */
  tail: number;
};

/**
 * The Kaiju's leap pose `t` s into a leap of `duration` s whose first `crouch` fraction is spent on the ground:
 * it sinks on bent knees, leaning in with arms drawn back and tail braced low; at liftoff it springs up past
 * standing, rearing, arms thrown forward and tail flung up; in the air it tucks its legs, then reaches them
 * back down to land (the landing squash is the monster's own dip).
 */
export function kaijuLeap(t: number, duration: number, crouch: number): KaijuLeapPose {
  const L0 = crouch * duration;
  if (t < L0) {
    const u = smooth(t / L0);
    return { sink: u, pitch: 0.32 * u, tuck: 0, arms: 0.5 * u, tail: -u };
  }
  const fly = Math.max(1e-6, duration - L0);
  const a = Math.min(1, (t - L0) / fly);
  const tuck = smooth((a - 0.1) / 0.3) * (1 - smooth((a - 0.65) / 0.3));
  const s = (t - L0) / SPRING;
  if (s < 1) {
    const k = smooth(s);
    return { sink: 1 - 1.35 * k, pitch: 0.32 - 0.47 * k, tuck, arms: 0.5 - 0.9 * k, tail: -1 + 1.6 * k };
  }
  const u = smooth((a - SPRING / fly) / 0.5);
  return { sink: -0.35 * (1 - u), pitch: -0.15 * (1 - u), tuck, arms: -0.4 * (1 - u), tail: 0.6 * (1 - u) };
}
