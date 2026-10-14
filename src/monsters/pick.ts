import { isMonsterId } from './roster';
import type { MonsterId } from './types';

/** RUN appStorage keys may not contain "." (nor start with "__"). */
export const PICK_KEY = 'azragon_monster';

/** The subset of RundotGameAPI.appStorage the pick needs (async; may reject). */
export type PickStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

/** Ids saved by older builds, read as the monster's current id. */
const RENAMED: Record<string, MonsterId> = { golem: 'wendigo' };

export function parsePick(raw: string | null | undefined): MonsterId {
  const id = raw && Object.prototype.hasOwnProperty.call(RENAMED, raw) ? RENAMED[raw] : raw;
  return id && isMonsterId(id) ? id : 'insect';
}

/** The last selected monster, or the Insect when storage is missing, failing, or holds anything else. */
export async function loadPick(store: PickStore | null): Promise<MonsterId> {
  if (!store) return 'insect';
  try {
    return parsePick(await store.getItem(PICK_KEY));
  } catch {
    return 'insect';
  }
}

export async function savePick(store: PickStore | null, id: MonsterId): Promise<void> {
  if (!store) return;
  try {
    await store.setItem(PICK_KEY, id);
  } catch {
    // Remembering the pick is a convenience; a failed save is not an error.
  }
}
