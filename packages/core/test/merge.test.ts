import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, versionOf, type HabitRecord, type LogRecord, type NewHabit } from '../src/repo.ts';

const T1 = new Date('2026-10-30T10:00:00Z');
const T2 = new Date('2026-10-30T11:00:00Z');
const water: NewHabit = { name: 'Drink water', kind: 'quantitative', target: 2000, unit: 'ml', schedule: { type: 'daily' }, startDate: '2026-10-29' };

const habit = (over: Partial<HabitRecord> = {}): HabitRecord => ({
  id: 'h1', ...water, createdAt: T1.toISOString(), updatedAt: T1.toISOString(), deletedAt: null, ...over,
});
const log = (over: Partial<LogRecord> = {}): LogRecord => ({
  id: 'l1', habitId: 'h1', logicalDate: '2026-10-30', kind: 'complete', value: 200,
  occurredAt: T1.toISOString(), isRetroactive: false, createdAt: T1.toISOString(), deletedAt: null, ...over,
});

test('versionOf: updatedAt falls back to createdAt, tombstone later than base wins', () => {
  assert.equal(versionOf({ createdAt: 'a' }), 'a');
  assert.equal(versionOf({ createdAt: 'a', updatedAt: 'b' }), 'b');
  assert.equal(versionOf({ createdAt: 'a', updatedAt: 'b', deletedAt: 'c' }), 'c');
  assert.equal(versionOf({ createdAt: 'a', updatedAt: 'b', deletedAt: 'a' }), 'b');
});

test('snapshot includes tombstones and is a copy', async () => {
  const repo = createMemoryRepo({ now: () => T1 });
  const h = await repo.addHabit(water);
  await repo.removeHabit(h.id);
  const snap = repo.snapshot();
  assert.equal(snap.length, 1);
  assert.equal(snap[0].entity, 'habits');
  assert.ok(snap[0].record.deletedAt);
  snap[0].record.id = 'mutated';
  assert.equal(repo.snapshot()[0].record.id, h.id);
});

test('merge inserts unknown records and reports count', async () => {
  const repo = createMemoryRepo();
  const applied = repo.merge([{ entity: 'habits', record: habit() }, { entity: 'habit_logs', record: log() }]);
  assert.equal(applied, 2);
  assert.equal((await repo.listHabits()).length, 1);
  assert.equal((await repo.listLogs('h1')).length, 1);
});

test('merge: newer version replaces, older is ignored', async () => {
  const repo = createMemoryRepo();
  repo.merge([{ entity: 'habits', record: habit({ name: 'v1' }) }]);
  assert.equal(repo.merge([{ entity: 'habits', record: habit({ name: 'v2', updatedAt: T2.toISOString() }) }]), 1);
  assert.equal(repo.merge([{ entity: 'habits', record: habit({ name: 'old' }) }]), 0);
  assert.equal((await repo.listHabits())[0].name, 'v2');
});

test('merge: tombstone wins a version tie, and hides the record', async () => {
  const repo = createMemoryRepo();
  repo.merge([{ entity: 'habit_logs', record: log() }]);
  repo.merge([{ entity: 'habits', record: habit() }]);
  const tomb = log({ deletedAt: T1.toISOString(), createdAt: T1.toISOString() });
  // deletedAt equals createdAt, so versionOf ties with the live copy; tombstone must still win
  assert.equal(repo.merge([{ entity: 'habit_logs', record: tomb }]), 1);
  assert.deepEqual(await repo.listLogs('h1'), []);
  // a live copy never resurrects a tombstone with the same version
  assert.equal(repo.merge([{ entity: 'habit_logs', record: log() }]), 0);
});

test('merge skips malformed items', async () => {
  const repo = createMemoryRepo();
  const bad = [
    { entity: 'habits', record: { name: 'no id' } },
    { entity: 'habit_logs', record: { id: 'x', createdAt: 'a' } },
    { entity: 'other', record: habit() },
  ] as unknown as Parameters<typeof repo.merge>[0];
  assert.equal(repo.merge(bad), 0);
  assert.deepEqual(repo.snapshot(), []);
});

test('merge accepts supplements group and rejects unsupported groups', async () => {
  const repo = createMemoryRepo();
  assert.equal(repo.merge([{ entity: 'habits', record: habit({ group: 'supplements' }) }]), 1);
  assert.equal(repo.merge([{ entity: 'habits', record: habit({ id: 'h2', group: 'other' as 'supplements' }) }]), 0);
  assert.equal((await repo.listHabits())[0].group, 'supplements');
});

test('subscribe fires on local writes and applied merges, not on no-op merges', async () => {
  const repo = createMemoryRepo({ now: () => T1 });
  let calls = 0;
  const off = repo.subscribe(() => { calls++; });
  const h = await repo.addHabit(water);
  assert.equal(calls, 1);
  repo.merge([{ entity: 'habits', record: { ...h, name: 'older', updatedAt: '2000-01-01T00:00:00.000Z' } }]);
  assert.equal(calls, 1);
  repo.merge([{ entity: 'habits', record: { ...h, name: 'newer', updatedAt: T2.toISOString() } }]);
  assert.equal(calls, 2);
  off();
  await repo.updateHabit(h.id, { name: 'x' });
  assert.equal(calls, 2);
});
