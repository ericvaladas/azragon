/** Seconds past the roar's end the Wendigo takes to lower its head back into the walk. */
export const HOWL_AFTER = 0.35;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

export type HowlPose = {
  /** 0..1: the build-up, head dropped and shoulders hunched low. */
  lower: number;
  /** 0..1: the howl, chest lifted, neck stretched up and muzzle tilted to the sky. */
  lift: number;
  /** 0..1: how wide the jaw hangs open. */
  jaw: number;
  /** 0..1: how hard it trembles through the held howl. */
  tremble: number;
};

/**
 * The Wendigo's roar as a wolf's howl, `t` s into a roar of `duration` s, all four limbs planted: it lowers its head
 * and hunches (to 0.2 of the roar), throws its head back to the sky with the jaw wide (by 0.4), holds the trembling
 * howl, and from 0.85 lowers its head back into the walk, done HOWL_AFTER s after the roar ends.
 */
export function howlPose(t: number, duration: number): HowlPose {
  const D = duration;
  const down = smooth((t - 0.85 * D) / (0.15 * D + HOWL_AFTER));
  const lift = smooth((t - 0.16 * D) / (0.24 * D)) * (1 - down);
  const lower = smooth(t / (0.18 * D)) * (1 - smooth((t - 0.16 * D) / (0.2 * D)));
  const jaw = smooth((t - 0.2 * D) / (0.18 * D)) * (1 - smooth((t - 0.82 * D) / (0.15 * D + HOWL_AFTER * 0.6)));
  const tremble = smooth((t - 0.36 * D) / (0.1 * D)) * (1 - smooth((t - 0.8 * D) / (0.15 * D)));
  return { lower, lift, jaw, tremble };
}
