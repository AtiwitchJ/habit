import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, createStorageRepo, tryStorage, type NewHabit, type StorageLike } from '../src/repo.ts';

const NOW = new Date('2026-10-30T10:00:00Z');
const water: NewHabit = { name: 'Drink water', kind: 'quantitative', target: 2000, unit: 'ml', schedule: { type: 'daily' }, startDate: '2026-10-29' };
const logInput = (habitId: string, logicalDate = '2026-10-30', value = 200) =>
  ({ habitId, logicalDate, kind: 'complete' as const, value, occurredAt: NOW.toISOString(), isRetroactive: false });

function stubStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; },
  };
}

test('habits: add, list, update, remove (tombstone)', async () => {
  const repo = createMemoryRepo({ now: () => NOW });
  const habit = await repo.addHabit(water);
  assert.match(habit.id, /^[0-9a-f-]{36}$/);
  assert.equal(habit.createdAt, NOW.toISOString());
  assert.deepEqual((await repo.listHabits()).map((h) => h.name), ['Drink water']);

  const updated = await repo.updateHabit(habit.id, { name: 'Water', target: 2500 });
  assert.equal(updated.name, 'Water');
  assert.equal(updated.target, 2500);

  await repo.removeHabit(habit.id);
  assert.deepEqual(await repo.listHabits(), []);
  await assert.rejects(() => repo.updateHabit(habit.id, { name: 'x' }), RangeError);
});

test('logs: add, list in insertion order, remove hides but keeps tombstone', async () => {
  const states: unknown[] = [];
  const repo = createMemoryRepo({ now: () => NOW, onChange: (s) => states.push(structuredClone(s)) });
  const habit = await repo.addHabit(water);
  const a = await repo.addLog(logInput(habit.id, '2026-10-30', 200));
  const b = await repo.addLog(logInput(habit.id, '2026-10-30', 300));
  assert.deepEqual((await repo.listLogs(habit.id)).map((l) => l.value), [200, 300]);

  await repo.removeLog(a.id);
  assert.deepEqual((await repo.listLogs(habit.id)).map((l) => l.id), [b.id]);
  const last = states.at(-1) as { logs: { id: string; deletedAt: string | null }[] };
  assert.equal(last.logs.find((l) => l.id === a.id)?.deletedAt, NOW.toISOString());

  await assert.rejects(() => repo.removeLog(a.id), RangeError);
  await assert.rejects(() => repo.addLog(logInput('missing')), RangeError);
});

test('storage repo persists across instances', async () => {
  const storage = stubStorage();
  const first = createStorageRepo(storage, () => NOW);
  const habit = await first.addHabit(water);
  await first.addLog(logInput(habit.id));

  const second = createStorageRepo(storage, () => NOW);
  assert.deepEqual((await second.listHabits()).map((h) => h.id), [habit.id]);
  assert.equal((await second.listLogs(habit.id)).length, 1);
});

test('reward ledger is idempotent by check-in log id and syncs as a record', async () => {
  const repo = createMemoryRepo({ now: () => NOW });
  const habit = await repo.addHabit(water);
  const log = await repo.addLog(logInput(habit.id));
  const reward = await repo.addReward({ logId: log.id, xp: 10, gold: 3 });
  const duplicate = await repo.addReward({ logId: log.id, xp: 10, gold: 3 });
  assert.deepEqual(duplicate, reward);
  assert.deepEqual(await repo.listRewards(), [reward]);
  assert.ok(repo.snapshot().some((item) => item.entity === 'rewards' && item.record.id === log.id));
});

test('completion with reward writes both records in one repository change', async () => {
  const states: unknown[] = [];
  const repo = createMemoryRepo({ now: () => NOW, onChange: (s) => states.push(structuredClone(s)) });
  const habit = await repo.addHabit(water);
  const before = states.length;
  const { log, reward } = await repo.addCompletionWithReward(logInput(habit.id), { xp: 10, gold: 3 });
  assert.equal(reward.id, log.id);
  assert.equal(states.length, before + 1);
  assert.equal((await repo.listLogs(habit.id)).length, 1);
  assert.equal((await repo.listRewards()).length, 1);
  await repo.removeLog(log.id);
  assert.deepEqual(await repo.listRewards(), []);
});

test('syncing an undone completion tombstones its reward too', async () => {
  const source = createMemoryRepo({ now: () => NOW });
  const habit = await source.addHabit(water);
  const { log } = await source.addCompletionWithReward(logInput(habit.id), { xp: 10, gold: 3 });
  const target = createMemoryRepo({ seed: { habits: await source.listHabits(), logs: source.snapshot().filter((x) => x.entity === 'habit_logs').map((x) => x.record as never) } });
  await target.addReward({ logId: log.id, xp: 10, gold: 3 });
  await source.removeLog(log.id);
  target.merge(source.snapshot().filter((item) => item.entity === 'habit_logs'));
  assert.deepEqual(await target.listRewards(), []);
});

test('storage repo starts empty on corrupt or wrong-shape data', async () => {
  for (const bad of ['{not json', '"hello"', '{"habits":1,"logs":[]}']) {
    const repo = createStorageRepo(stubStorage({ 'habit:v1': bad }), () => NOW);
    assert.deepEqual(await repo.listHabits(), []);
  }
});

test('storage repo survives setItem failure (quota)', async () => {
  const storage = stubStorage();
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const repo = createStorageRepo(storage, () => NOW);
  await repo.addHabit(water);
  assert.equal((await repo.listHabits()).length, 1);
});

test('tryStorage returns storage when usable, null when access throws', () => {
  const storage = stubStorage();
  assert.equal(tryStorage(() => storage), storage);
  assert.deepEqual(storage.data, {});
  assert.equal(tryStorage(() => { throw new Error('SecurityError'); }), null);
  const readOnly = stubStorage();
  readOnly.setItem = () => { throw new Error('denied'); };
  assert.equal(tryStorage(() => readOnly), null);
});
