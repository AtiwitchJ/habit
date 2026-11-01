import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatmapLevels } from '../src/heatmap.ts';
import type { HabitRule, LogRow } from '../src/streak.ts';

const rule = (target: number): HabitRule => ({ startDate: '2026-10-01', target, schedule: { type: 'daily' } });
const done = (logicalDate: string, value = 1): LogRow => ({ logicalDate, kind: 'complete', value });

test('boolean: done day is level 4, empty day level 0', () => {
  const cells = heatmapLevels(rule(1), [done('2026-10-02')], '2026-10-01', '2026-10-03');
  assert.deepEqual(cells, [
    { date: '2026-10-01', level: 0 },
    { date: '2026-10-02', level: 4 },
    { date: '2026-10-03', level: 0 },
  ]);
});

test('quantitative: ratio buckets, capped at 4', () => {
  const logs = [done('2026-10-01', 500), done('2026-10-02', 1000), done('2026-10-03', 1500), done('2026-10-04', 2000), done('2026-10-05', 3000)];
  const levels = heatmapLevels(rule(2000), logs, '2026-10-01', '2026-10-05').map((c) => c.level);
  assert.deepEqual(levels, [1, 2, 3, 4, 4]);
});

test('multiple logs on one day are summed', () => {
  const levels = heatmapLevels(rule(2000), [done('2026-10-01', 1000), done('2026-10-01', 1000)], '2026-10-01', '2026-10-01');
  assert.deepEqual(levels.map((c) => c.level), [4]);
});

test('skip, freeze and deleted logs give level 0', () => {
  const logs: LogRow[] = [
    { logicalDate: '2026-10-01', kind: 'skip', value: 0 },
    { logicalDate: '2026-10-02', kind: 'freeze', value: 0 },
    { ...done('2026-10-03'), deletedAt: '2026-10-04T00:00:00Z' },
  ];
  const levels = heatmapLevels(rule(1), logs, '2026-10-01', '2026-10-03').map((c) => c.level);
  assert.deepEqual(levels, [0, 0, 0]);
});

test('empty range returns no cells', () => {
  assert.deepEqual(heatmapLevels(rule(1), [], '2026-10-03', '2026-10-01'), []);
});
