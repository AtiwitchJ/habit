import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, type NewHabit } from '../src/repo.ts';
import { canLog, checkIn, clearDay, stepFor, undoCheckIn } from '../src/checkin.ts';
import { summarize } from '../src/summary.ts';

const NOW = new Date('2026-10-30T10:00:00Z');
const TODAY = '2026-10-30';
const water: NewHabit = { name: 'Drink water', kind: 'quantitative', target: 2000, unit: 'ml', schedule: { type: 'daily' }, startDate: '2026-10-29' };
const meditate: NewHabit = { name: 'Meditate', kind: 'boolean', target: 1, schedule: { type: 'daily' }, startDate: '2026-10-29' };

async function setup(input: NewHabit) {
  const repo = createMemoryRepo({ now: () => NOW });
  return { repo, habit: await repo.addHabit(input) };
}

test('stepFor: boolean 1, quantitative about a tenth of target, min 1', () => {
  assert.equal(stepFor({ kind: 'boolean', target: 1 }), 1);
  assert.equal(stepFor({ kind: 'quantitative', target: 2000 }), 200);
  assert.equal(stepFor({ kind: 'quantitative', target: 7 }), 1);
  assert.equal(stepFor({ kind: 'quantitative', target: 5 }), 1);
});

test('canLog: not before start, not in the future, not more than 30 days back', () => {
  const habit = { startDate: '2026-09-01' };
  assert.equal(canLog(habit, '2026-10-30', TODAY), true);
  assert.equal(canLog(habit, '2026-09-30', TODAY), true); // 30 days back
  assert.equal(canLog(habit, '2026-09-29', TODAY), false); // 31 days back
  assert.equal(canLog(habit, '2026-10-31', TODAY), false);
  assert.equal(canLog({ startDate: '2026-10-29' }, '2026-10-28', TODAY), false);
});

test('quantitative: ten steps reach target, undo removes one step', async () => {
  const { repo, habit } = await setup(water);
  for (let i = 0; i < 10; i++) await checkIn(repo, habit, TODAY, TODAY, NOW);
  let summary = summarize(habit, await repo.listLogs(habit.id), TODAY, TODAY);
  assert.deepEqual({ value: summary.value, done: summary.done, current: summary.streak.current }, { value: 2000, done: true, current: 1 });

  await undoCheckIn(repo, habit, TODAY);
  summary = summarize(habit, await repo.listLogs(habit.id), TODAY, TODAY);
  assert.deepEqual({ value: summary.value, done: summary.done }, { value: 1800, done: false });
});

test('retroactive check-in is flagged and updates the streak', async () => {
  const { repo, habit } = await setup(meditate);
  await checkIn(repo, habit, '2026-10-29', TODAY, NOW);
  const logs = await repo.listLogs(habit.id);
  assert.equal(logs[0].isRetroactive, true);
  assert.equal(summarize(habit, logs, TODAY, TODAY).streak.current, 1); // yesterday done, today still open

  await checkIn(repo, habit, TODAY, TODAY, NOW);
  assert.equal(summarize(habit, await repo.listLogs(habit.id), TODAY, TODAY).streak.current, 2);
});

test('clearDay removes every completion on that date only', async () => {
  const { repo, habit } = await setup(meditate);
  await checkIn(repo, habit, '2026-10-29', TODAY, NOW);
  await checkIn(repo, habit, TODAY, TODAY, NOW);
  await checkIn(repo, habit, TODAY, TODAY, NOW);
  await clearDay(repo, habit, TODAY);
  assert.deepEqual((await repo.listLogs(habit.id)).map((l) => l.logicalDate), ['2026-10-29']);
});

test('checkIn rejects dates outside the allowed range', async () => {
  const { repo, habit } = await setup(meditate);
  await assert.rejects(() => checkIn(repo, habit, '2026-10-28', TODAY, NOW), RangeError);
  await assert.rejects(() => checkIn(repo, habit, '2026-10-31', TODAY, NOW), RangeError);
});

test('summarize: due follows the schedule', async () => {
  const { repo, habit } = await setup({ ...meditate, schedule: { type: 'weekdays', days: [1, 3, 5] } });
  const logs = await repo.listLogs(habit.id);
  assert.equal(summarize(habit, logs, '2026-10-30', TODAY).due, true); // Friday
  assert.equal(summarize(habit, logs, '2026-10-29', TODAY).due, false); // Thursday
});
