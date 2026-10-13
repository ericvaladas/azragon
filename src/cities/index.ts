import { TOKYO } from './tokyo';
import type { CityStyle } from './types';

/** Every playable city; a run starts in one picked at random. */
export const CITIES: readonly CityStyle[] = [TOKYO];

export function pickCity(rng: () => number): CityStyle {
  return CITIES[Math.floor(rng() * CITIES.length)]!;
}
