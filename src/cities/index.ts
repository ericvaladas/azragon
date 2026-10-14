import { TOKYO } from './tokyo';
import { TORONTO } from './toronto';
import type { CityStyle } from './types';

/** Every playable city; a run starts in one picked at random. */
export const CITIES: readonly CityStyle[] = [TOKYO, TORONTO];

export function pickCity(rng: () => number): CityStyle {
  return CITIES[Math.floor(rng() * CITIES.length)]!;
}

/**
 * Dev override for screenshots and soaks: the `city` URL parameter, a comma-separated list of city ids (any case,
 * spaces ignored), gives run `run` the list's entry `run mod length`. Unknown ids are skipped; null (pick at random)
 * without the parameter or when no listed id is known.
 */
export function forcedCity(search: string, run: number, cities: readonly CityStyle[] = CITIES): CityStyle | null {
  const raw = new URLSearchParams(search).get('city');
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => cities.find((c) => c.id === s.trim().toLowerCase()))
    .filter((c): c is CityStyle => c !== undefined);
  return list.length > 0 ? list[run % list.length]! : null;
}
