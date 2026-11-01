import { addDays, type LogicalDate } from './logical-date.ts';
import type { HabitRule, LogRow } from './streak.ts';

export interface HeatCell {
  date: LogicalDate;
  level: 0 | 1 | 2 | 3 | 4;
}

// One cell per logical day in [from, to]. Level = ceil(min(done/target, 1) * 4).
// skip / freeze / deleted logs contribute nothing.
export function heatmapLevels(rule: HabitRule, logs: LogRow[], from: LogicalDate, to: LogicalDate): HeatCell[] {
  const totals = new Map<LogicalDate, number>();
  for (const log of logs) {
    if (log.deletedAt || log.kind !== 'complete') continue;
    totals.set(log.logicalDate, (totals.get(log.logicalDate) ?? 0) + log.value);
  }
  const cells: HeatCell[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const ratio = Math.min((totals.get(date) ?? 0) / rule.target, 1);
    cells.push({ date, level: Math.ceil(ratio * 4) as HeatCell['level'] });
  }
  return cells;
}
