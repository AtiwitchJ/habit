import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, HUES } from '../src/repo.ts';
import { CATEGORY_HUE, HABIT_TEMPLATES, templatesByCategory } from '../src/templates.ts';

test('template ids are unique slugs', () => {
  const ids = HABIT_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('template targets, units and schedules are valid', () => {
  for (const t of HABIT_TEMPLATES) {
    assert.ok(t.name.trim(), t.id);
    if (t.kind === 'boolean') assert.equal(t.target, 1, t.id);
    else {
      assert.ok(t.target > 0, t.id);
      assert.ok(t.unit?.trim(), `${t.id} needs unit`);
    }
    if (t.schedule.type === 'weekdays') {
      assert.ok(t.schedule.days.length > 0, t.id);
      for (const d of t.schedule.days) assert.ok(Number.isInteger(d) && d >= 1 && d <= 7, t.id);
    }
    if (t.schedule.type === 'times_per_week') assert.ok(t.schedule.count >= 1 && t.schedule.count <= 7, t.id);
    if (t.reminderTime) assert.match(t.reminderTime, /^([01]\d|2[0-3]):[0-5]\d$/, t.id);
  }
});

test('catalog is broad: 100+ templates, every category has 7+', () => {
  assert.ok(HABIT_TEMPLATES.length >= 100);
  const grouped = templatesByCategory();
  assert.equal(grouped.size, 13);
  for (const [category, list] of grouped) assert.ok(list.length >= 7, category);
});

test('catalog mixes kinds and schedule types', () => {
  assert.ok(new Set(HABIT_TEMPLATES.map((t) => t.kind)).size === 2);
  assert.ok(new Set(HABIT_TEMPLATES.map((t) => t.schedule.type)).size === 3);
  assert.ok(new Set(HABIT_TEMPLATES.map((t) => t.unit).filter(Boolean)).size >= 10);
});

test('every template has an emoji icon and every category a hue', () => {
  for (const t of HABIT_TEMPLATES) assert.match(t.icon, /^\p{Extended_Pictographic}/u, t.id);
  for (const category of templatesByCategory().keys()) assert.ok(HUES.includes(CATEGORY_HUE[category]), category);
  assert.ok(new Set(HABIT_TEMPLATES.map((t) => t.icon)).size >= 90, 'icons should be varied');
  assert.ok(new Set(Object.values(CATEGORY_HUE)).size >= 7, 'hues should be varied');
});

test('repo stores icon and color and lets them be patched', async () => {
  const repo = createMemoryRepo();
  const habit = await repo.addHabit({ name: 'Swim', kind: 'boolean', target: 1, schedule: { type: 'daily' }, startDate: '2026-11-01', icon: '🏊', color: 'blue' });
  assert.equal(habit.icon, '🏊');
  assert.equal(habit.color, 'blue');
  const patched = await repo.updateHabit(habit.id, { icon: '🚴', color: 'orange' });
  assert.deepEqual([patched.icon, patched.color], ['🚴', 'orange']);
});

test('unit alternatives are valid and only on quantitative templates', () => {
  for (const t of HABIT_TEMPLATES) {
    if (!t.alts) continue;
    assert.equal(t.kind, 'quantitative', t.id);
    const units = [t.unit, ...t.alts.map((a) => a.unit)];
    assert.equal(new Set(units).size, units.length, `${t.id} repeats a unit`);
    for (const a of t.alts) assert.ok(a.target > 0 && a.unit.trim(), t.id);
  }
  assert.ok(HABIT_TEMPLATES.filter((t) => t.alts).length >= 20);
});
