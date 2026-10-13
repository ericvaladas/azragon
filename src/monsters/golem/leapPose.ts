/** Seconds after landing the Wendigo takes to rise out of its landing crouch back into the walk. */
export const LEAP_RECOVER = 0.5;
/** Seconds after liftoff the limbs keep pushing off the ground (the spring). */
const SPRING = 0.14;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

export type LeapPose = {
  /** How deep the body crouches (1 deep, 0 standing, below 0 stretched up past standing). */
  sink: number;
  /** Extra pitch (rad, + chest down). */
  pitch: number;
  /** 1 while the limbs are still pushing on the ground they left from, easing to 0 as they let go. */
  push: number;
  /** 0..1: arms stretched forward in the air. */
  reach: number;
  /** 0..1: hind legs stretched straight out behind, trailing the spring (never tucked up in the air). */
  trail: number;
  /** 0..1: claws reaching down for the ground ahead to land on (then planted). */
  land: number;
};

/**
 * The Wendigo's leap pose `t` s into a leap of `duration` s whose first `crouch` fraction is spent on the ground:
 * a deep crouch, chest low between the claws; at liftoff the body springs up past standing, rearing, as the hind
 * legs and arms push off; in the air the arms reach forward and the hind legs stay stretched out behind; the claws
 * reach down to land first (the legs reaching for the ground after them);
 * after touchdown (t > duration) a deep landing crouch that recovers over LEAP_RECOVER s.
 */
export function leapPhase(t: number, duration: number, crouch: number): LeapPose {
  const L0 = crouch * duration;
  if (t < L0) {
    const u = smooth(t / L0);
    return { sink: u, pitch: 0.18 * u, push: 1, reach: 0, trail: 0, land: 0 };
  }
  if (t <= duration) {
    const fly = duration - L0;
    const a = (t - L0) / fly;
    const reach = smooth((a - 0.05) / 0.35) * (1 - 0.3 * smooth((a - 0.55) / 0.25));
    const land = smooth((a - 0.75) / 0.25);
    const s = (t - L0) / SPRING;
    if (s < 1) {
      const k = smooth(s);
      return { sink: 1 - 1.4 * k, pitch: 0.18 - 0.4 * k, push: 1 - k, reach, trail: k * (1 - land), land };
    }
    const settle = smooth((a - SPRING / fly) / 0.4);
    return { sink: -0.4 * (1 - settle), pitch: -0.22 + 0.37 * smooth((a - SPRING / fly) / (0.9 - SPRING / fly)), push: 0, reach, trail: 1 - land, land };
  }
  const r = (t - duration) / LEAP_RECOVER;
  if (r >= 1) return { sink: 0, pitch: 0, push: 0, reach: 0, trail: 0, land: 0 };
  const sink = r < 0.2 ? smooth(r / 0.2) : 1 - smooth((r - 0.2) / 0.8);
  const ease = 1 - smooth(r / 0.3);
  return { sink, pitch: 0.15 * (1 - smooth(r)) + 0.2 * sink, push: 0, reach: 0.7 * ease, trail: 0, land: 1 - smooth(r) };
}
