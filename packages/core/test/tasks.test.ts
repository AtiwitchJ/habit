import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, createStorageRepo, type StorageLike } from '../src/repo.ts';
import { orderTasks } from '../src/tasks.ts';

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 9, 30, 10, 0, tick++));

test('tasks: add, complete, reopen, remove as tombstone', async () => {
  const repo = createMemoryRepo({ now: clock });
  const task = await repo.addTask({ title: 'Buy rice' });
  assert.equal(task.doneAt, null);
  const done = await repo.updateTask(task.id, { doneAt: '2026-10-30T11:00:00.000Z' });
  assert.equal(done.doneAt, '2026-10-30T11:00:00.000Z');
  await repo.updateTask(task.id, { doneAt: null });
  await repo.removeTask(task.id);
  assert.deepEqual(await repo.listTasks(), []);
  const [item] = repo.snapshot().filter((i) => i.entity === 'tasks');
  assert.ok(item.record.deletedAt, 'tombstone kept for sync');
  await assert.rejects(() => repo.updateTask(task.id, { title: 'x' }), RangeError);
});

test('tasks sync: newer wins, tombstone wins a tie, bad rows ignored, old saved state loads', async () => {
  const a = createMemoryRepo({ now: clock });
  const b = createMemoryRepo({ now: clock });
  const task = await a.addTask({ title: 'Call mom' });
  assert.equal(b.merge(a.snapshot()), 1);
  await b.updateTask(task.id, { title: 'Call mom today' });
  a.merge(b.snapshot());
  assert.equal((await a.listTasks())[0].title, 'Call mom today');
  await a.removeTask(task.id);
  b.merge(a.snapshot());
  assert.deepEqual(await b.listTasks(), []);
  assert.equal(b.merge([{ entity: 'tasks', record: { id: 'x' } as never }]), 0);

  const data: Record<string, string> = { 'habit:v1': JSON.stringify({ habits: [], logs: [] }) }; // saved before tasks existed
  const storage: StorageLike = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
  const old = createStorageRepo(storage);
  await old.addTask({ title: 'works' });
  assert.equal((await old.listTasks()).length, 1);
});

test('orderTasks: open before done, then due date (none last), then oldest first', () => {
  const t = (id: string, over: object = {}) => ({ id, title: id, doneAt: null, createdAt: id, updatedAt: id, ...over });
  const ordered = orderTasks([
    t('d', { doneAt: 'x' }), t('c'), t('b', { dueDate: '2026-11-02' }), t('a', { dueDate: '2026-11-01' }),
  ]);
  assert.deepEqual(ordered.map((x) => x.id), ['a', 'b', 'c', 'd']);
});
