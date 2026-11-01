import { addDays, startOfIsoWeek, type LogicalDate } from './logical-date.ts';

export function calendarDays(date: LogicalDate, view: 'day' | 'week' | 'month'): LogicalDate[] {
  if (view === 'day') return [date];
  const first = view === 'week' ? date : `${date.slice(0, 7)}-01`;
  const start = startOfIsoWeek(first);
  const end = view === 'week' ? addDays(start, 6) : addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1);
  const days: LogicalDate[] = [];
  for (let day = start; day <= end || days.length % 7 !== 0; day = addDays(day, 1)) days.push(day);
  return days;
}
