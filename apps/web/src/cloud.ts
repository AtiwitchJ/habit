import PocketBase from 'pocketbase';
import { STORAGE_KEY } from '@habit/core/repo';
import { storage } from './repo-local.ts';

// No server URL means local-only mode: no login, no sync.
const url = import.meta.env.VITE_PB_URL as string | undefined;
export const pb = url ? new PocketBase(url) : null;

const OWNER_KEY = 'habit:owner';
const GUEST_KEY = 'habit:guest';
const syncKey = (userId: string) => `habit:sync:${userId}`;

export const isGuest = () => storage?.getItem(GUEST_KEY) === '1';
export function setGuest(guest: boolean): void {
  try {
    if (guest) storage?.setItem(GUEST_KEY, '1');
    else storage?.removeItem(GUEST_KEY);
  } catch {
    // choice lasts for this session only
  }
}

// Local data belongs to one account. Signing in as someone else wipes it first, so one
// user's habits are never uploaded into another account. Guest data is adopted by the first account.
// Returns false when the page is reloading because local data was cleared.
export function claimDevice(userId: string): boolean {
  if (!storage) return true;
  const owner = storage.getItem(OWNER_KEY);
  if (owner && owner !== userId) {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem(syncKey(owner));
    storage.setItem(OWNER_KEY, userId);
    location.reload();
    return false;
  }
  storage.setItem(OWNER_KEY, userId);
  return true;
}

export function wipeLocalData(userId: string): void {
  storage?.removeItem(STORAGE_KEY);
  storage?.removeItem(OWNER_KEY);
  storage?.removeItem(syncKey(userId));
}
