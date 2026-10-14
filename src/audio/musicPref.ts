import type { PickStore } from '../monsters/pick';

/** RUN appStorage keys may not contain "." (nor start with "__"). */
export const MUSIC_KEY = 'azragon_music';

/** Music is on unless the player turned it off. */
export function parseMusicOn(raw: string | null | undefined): boolean {
  return raw !== 'off';
}

/** The saved music setting; on when storage is missing, failing, or holds anything else. */
export async function loadMusicOn(store: PickStore | null): Promise<boolean> {
  if (!store) return true;
  try {
    return parseMusicOn(await store.getItem(MUSIC_KEY));
  } catch {
    return true;
  }
}

export async function saveMusicOn(store: PickStore | null, on: boolean): Promise<void> {
  if (!store) return;
  try {
    await store.setItem(MUSIC_KEY, on ? 'on' : 'off');
  } catch {
    // Remembering the setting is a convenience; a failed save is not an error.
  }
}
