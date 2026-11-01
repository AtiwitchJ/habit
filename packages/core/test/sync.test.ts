import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, versionOf, type LocalRepo, type NewHabit, type StorageLike, type SyncItem } from '../src/repo.ts';
import { createSyncEngine, emptySyncState, loadSyncState, saveSyncState, type RemoteItem, type SyncTransport } from '../src/sync.ts';

const water: NewHabit = { name: 'Drink water', kind: 'quantitative', target: 2000, unit: 'ml', schedule: { type: 'daily' }, startDate: '2026-10-29' };

// In-memory server. Mirrors PocketBase semantics the engine relies on:
// higher version wins on upsert, and pull uses `cursor >= given` (inclusive).
class FakeServer implements SyncTransport {
  rows = new Map<string, { item: SyncItem; cursor: string }>();
  counter = 0;
  pushCalls = 0;
  failPush = false;
  onPush: (() => void) | null = null;

  async push(items: SyncItem[]) {
    this.pushCalls++;
    this.onPush?.();
    if (this.failPush) throw new Error('network down');
    for (const item of items) {
      const key = `${item.entity}:${item.record.id}`;
      const existing = this.rows.get(key);
      if (existing && versionOf(existing.item.record) >= versionOf(item.record)) continue;
      this.rows.set(key, { item: structuredClone(item), cursor: String(++this.counter).padStart(8, '0') });
    }
  }

  async pull(cursor: string | null, limit: number): Promise<RemoteItem[]> {
    return [...this.rows.values()]
      .filter((row) => cursor === null || row.cursor >= cursor)
      .sort((a, b) => a.cursor.localeCompare(b.cursor))
      .slice(0, limit)
      .map((row) => ({ ...structuredClone(row.item), cursor: row.cursor }));
  }
}

function device(server: FakeServer, clock: { t: number }) {
  const repo = createMemoryRepo({ now: () => new Date(1_700_000_000_000 + clock.t * 1000) });
  const state = emptySyncState();
  const engine = createSyncEngine({ store: repo, transport: server, state, save: () => {} });
  return { repo, state, engine };
}

const names = async (repo: LocalRepo) => (await repo.listHabits()).map((h) => h.name).sort();
const logIds = async (repo: LocalRepo, habitId: string) => (await repo.listLogs(habitId)).map((l) => l.id).sort();
const log = (habitId: string, date = '2026-10-30') => ({ habitId, logicalDate: date, kind: 'complete' as const, value: 200, occurredAt: '2026-10-30T10:00:00.000Z', isRetroactive: false });

test('push uploads dirty records once; second sync is a no-op', async () => {
  const server = new FakeServer();
  const a = device(server, { t: 1 });
  const h = await a.repo.addHabit(water);
  await a.repo.addLog(log(h.id));
  assert.deepEqual(await a.engine.sync(), { pushed: 2, pulled: 2 });
  assert.equal(server.rows.size, 2);
  assert.deepEqual(await a.engine.sync(), { pushed: 0, pulled: 1 }); // inclusive cursor re-reads the last row
  assert.equal(server.pushCalls, 1);
});

test('pull pages through more rows than one page', async () => {
  const server = new FakeServer();
  const a = device(server, { t: 1 });
  const h = await a.repo.addHabit(water);
  for (let i = 0; i < 250; i++) await a.repo.addLog(log(h.id, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`));
  await a.engine.sync();

  const b = device(server, { t: 2 });
  await b.engine.sync();
  assert.equal((await b.repo.listLogs(h.id)).length, 250);
  assert.equal(b.state.synced[h.id], versionOf(h));
});

test('failed push leaves records dirty and retries', async () => {
  const server = new FakeServer();
  const a = device(server, { t: 1 });
  await a.repo.addHabit(water);
  server.failPush = true;
  await assert.rejects(() => a.engine.sync(), /network down/);
  assert.deepEqual(a.state.synced, {});
  server.failPush = false;
  assert.equal((await a.engine.sync()).pushed, 1);
});

test('sync requested during a running sync reruns afterwards (no lost trigger)', async () => {
  const server = new FakeServer();
  const a = device(server, { t: 1 });
  await a.repo.addHabit(water);
  let late = false;
  server.onPush = () => {
    if (late) return;
    late = true;
    void a.repo.addHabit({ ...water, name: 'added mid-sync' }).then(() => a.engine.sync());
  };
  await a.engine.sync();
  assert.equal(server.rows.size, 2);
});

test('concurrent sync calls share one run', async () => {
  const server = new FakeServer();
  const a = device(server, { t: 1 });
  await a.repo.addHabit(water);
  await Promise.all([a.engine.sync(), a.engine.sync(), a.engine.sync()]);
  assert.equal(server.pushCalls, 1);
});

test('two devices converge after conflicting offline edits', async () => {
  const server = new FakeServer();
  const clockA = { t: 1 };
  const clockB = { t: 1 };
  const a = device(server, clockA);
  const b = device(server, clockB);

  const h = await a.repo.addHabit(water);
  const l1 = await a.repo.addLog(log(h.id, '2026-10-29'));
  await a.engine.sync();
  await b.engine.sync();
  assert.deepEqual(await names(b.repo), ['Drink water']);

  // both offline
  clockA.t = 10; await a.repo.updateHabit(h.id, { name: 'A-name' });
  clockA.t = 11; const l2 = await a.repo.addLog(log(h.id, '2026-10-30'));
  clockB.t = 20; await b.repo.updateHabit(h.id, { name: 'B-name' });
  clockB.t = 21; await b.repo.removeLog(l1.id);
  clockB.t = 22; const l3 = await b.repo.addLog(log(h.id, '2026-10-31'));

  await a.engine.sync();
  await b.engine.sync();
  await a.engine.sync();

  assert.deepEqual(await names(a.repo), ['B-name']); // later write wins
  assert.deepEqual(await names(b.repo), ['B-name']);
  const expected = [l2.id, l3.id].sort();
  assert.deepEqual(await logIds(a.repo, h.id), expected); // l1 deleted, l2 and l3 kept
  assert.deepEqual(await logIds(b.repo, h.id), expected);
});

test('delete propagates and is not resurrected by a stale device', async () => {
  const server = new FakeServer();
  const clockA = { t: 1 };
  const clockB = { t: 1 };
  const a = device(server, clockA);
  const b = device(server, clockB);
  const h = await a.repo.addHabit(water);
  await a.engine.sync();
  await b.engine.sync();

  clockA.t = 5;
  await a.repo.removeHabit(h.id);
  await a.engine.sync();
  await b.engine.sync(); // b still held the live copy
  assert.deepEqual(await b.repo.listHabits(), []);
  await b.engine.sync();
  await a.engine.sync();
  assert.deepEqual(await a.repo.listHabits(), []);
});

test('sync state persists per key and tolerates corrupt data', () => {
  const data: Record<string, string> = {};
  const storage: StorageLike = {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
  assert.deepEqual(loadSyncState(storage, 'k'), emptySyncState());
  saveSyncState(storage, 'k', { cursor: '0001', synced: { x: 'v' } });
  assert.deepEqual(loadSyncState(storage, 'k'), { cursor: '0001', synced: { x: 'v' } });
  data.k = '{broken';
  assert.deepEqual(loadSyncState(storage, 'k'), emptySyncState());
  data.k = '{"cursor":5,"synced":[]}';
  assert.deepEqual(loadSyncState(storage, 'k'), emptySyncState());
});
