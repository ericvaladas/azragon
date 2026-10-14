import type { BaySpec } from './types';

/** Metres from (x, z) to the coastline along the bay's dir: positive inland, negative out in the bay. */
export function coastDistance(bay: BaySpec, x: number, z: number): number {
  const along = x * bay.dir.x + z * bay.dir.z;
  const across = -x * bay.dir.z + z * bay.dir.x;
  return bay.offset + bay.amp * Math.sin(across / bay.wavelength) - along;
}
