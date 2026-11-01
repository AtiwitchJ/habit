import type PocketBase from 'pocketbase';
import { createPocketBaseTransport, RECORDS_COLLECTION } from '@habit/core/pocketbase-transport';
import { createSyncEngine, emptySyncState, loadSyncState, saveSyncState } from '@habit/core/sync';
import { repo, storage } from './repo-local.ts';

export interface SyncStatus {
  state: 'syncing' | 'idle' | 'offline' | 'error';
  lastSyncedAt?: Date;
  error?: string;
}

const INTERVAL_MS = 30_000;
const DEBOUNCE_MS = 2_000;

// Starts syncing the local repo with PocketBase for `userId`. Returns a function that stops it.
export function startSync(pb: PocketBase, userId: string, onStatus: (status: SyncStatus) => void): () => void {
  const key = `habit:sync:${userId}`;
  const engine = createSyncEngine({
    store: repo,
    transport: createPocketBaseTransport(pb, userId),
    state: storage ? loadSyncState(storage, key) : emptySyncState(),
    save: (state) => {
      if (storage) saveSyncState(storage, key, state);
    },
  });

  let stopped = false;
  let lastSyncedAt: Date | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    if (stopped) return;
    if (!navigator.onLine) return onStatus({ state: 'offline', lastSyncedAt });
    onStatus({ state: 'syncing', lastSyncedAt });
    try {
      await engine.sync();
      lastSyncedAt = new Date();
      if (!stopped) onStatus({ state: 'idle', lastSyncedAt });
    } catch (e) {
      if (!stopped) onStatus({ state: 'error', lastSyncedAt, error: e instanceof Error ? e.message : String(e) });
    }
  };
  const schedule = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void run(), DEBOUNCE_MS);
  };

  const offChange = repo.subscribe(schedule);
  const interval = setInterval(() => void run(), INTERVAL_MS);
  window.addEventListener('online', schedule);
  const unsubscribe = pb.collection(RECORDS_COLLECTION).subscribe('*', schedule).catch(() => undefined);
  void run();

  return () => {
    stopped = true;
    offChange();
    clearTimeout(debounce);
    clearInterval(interval);
    window.removeEventListener('online', schedule);
    void unsubscribe.then((off) => off?.());
  };
}
