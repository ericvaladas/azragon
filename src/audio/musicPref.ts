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

export const VOLUME_KEY = 'azragon_music_volume';

/** The saved music volume, 0..1; full when nothing valid was saved. */
export function parseVolume(raw: string | null | undefined): number {
  const v = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/** The saved music volume; full when storage is missing, failing, or holds anything else. */
export async function loadVolume(store: PickStore | null): Promise<number> {
  if (!store) return 1;
  try {
    return parseVolume(await store.getItem(VOLUME_KEY));
  } catch {
    return 1;
  }
}

export async function saveVolume(store: PickStore | null, volume: number): Promise<void> {
  if (!store) return;
  try {
    await store.setItem(VOLUME_KEY, String(volume));
  } catch {
    // Remembering the setting is a convenience; a failed save is not an error.
  }
}
