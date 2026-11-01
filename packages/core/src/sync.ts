// State-based sync. No queue: a record is dirty when its version differs from the last version
// the server confirmed. sync() = push dirty records, then pull everything newer than the cursor
// and merge with last-write-wins. Repeating it is always safe.

import { versionOf, type StorageLike, type SyncAccess, type SyncItem } from './repo.ts';

export interface RemoteItem extends SyncItem {
  cursor: string; // server ordering key of this row (PocketBase `updated`)
}

export interface SyncTransport {
  // Upsert by record id. The server must keep the row with the higher version.
  push(items: SyncItem[]): Promise<void>;
  // Rows with cursor >= `cursor` (inclusive), oldest first, at most `limit`. null = from the start.
  pull(cursor: string | null, limit: number): Promise<RemoteItem[]>;
}

export interface SyncState {
  cursor: string | null;
  synced: Record<string, string>; // record id -> version the server is known to have
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

export interface SyncEngine {
  state: SyncState;
  sync(): Promise<SyncResult>;
}

const PUSH_BATCH = 50;
const PULL_LIMIT = 100;

export const emptySyncState = (): SyncState => ({ cursor: null, synced: {} });

export function loadSyncState(storage: StorageLike, key: string): SyncState {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? 'null');
    const valid =
      parsed &&
      (parsed.cursor === null || typeof parsed.cursor === 'string') &&
      parsed.synced && typeof parsed.synced === 'object' && !Array.isArray(parsed.synced);
    if (valid) return parsed;
  } catch {
    // fall through to a full resync
  }
  return emptySyncState();
}

export function saveSyncState(storage: StorageLike, key: string, state: SyncState): void {
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // losing sync state only costs a re-push of already-synced records (idempotent)
  }
}

export function createSyncEngine(options: {
  store: SyncAccess;
  transport: SyncTransport;
  state: SyncState;
  save(state: SyncState): void;
}): SyncEngine {
  const { store, transport, state, save } = options;
  let current: Promise<SyncResult> | null = null;
  let again = false;

  async function run(): Promise<SyncResult> {
    let pushed = 0;
    let pulled = 0;

    const dirty = store.snapshot().filter(({ record }) => state.synced[record.id] !== versionOf(record));
    for (let i = 0; i < dirty.length; i += PUSH_BATCH) {
      const batch = dirty.slice(i, i + PUSH_BATCH);
      await transport.push(batch);
      for (const { record } of batch) state.synced[record.id] = versionOf(record);
      pushed += batch.length;
      save(state);
    }

    for (;;) {
      const items = await transport.pull(state.cursor, PULL_LIMIT);
      if (items.length === 0) break;
      store.merge(items);
      for (const { record } of items) {
        const version = versionOf(record);
        if (version > (state.synced[record.id] ?? '')) state.synced[record.id] = version;
      }
      pulled += items.length;
      const next = items[items.length - 1].cursor;
      const stalled = next === state.cursor;
      state.cursor = next;
      save(state);
      // ponytail: a full page sharing one cursor would stall here; fine while writes carry distinct timestamps
      if (items.length < PULL_LIMIT || stalled) break;
    }
    return { pushed, pulled };
  }

  return {
    state,
    sync() {
      if (current) {
        again = true; // a change landed mid-sync: run once more when this one ends
        return current;
      }
      current = (async () => {
        try {
          const total = await run();
          while (again) {
            again = false;
            const extra = await run();
            total.pushed += extra.pushed;
            total.pulled += extra.pulled;
          }
          return total;
        } finally {
          current = null;
          again = false;
        }
      })();
      return current;
    },
  };
}
