import { useState } from 'react';
import { calendarDays, rangeStats } from '@habit/core/calendar';
import { addDays, type LogicalDate } from '@habit/core/logical-date';
import type { HabitRecord, LogRecord } from '@habit/core/repo';

export function Calendar({ today, habits, logs }: { today: LogicalDate; habits: HabitRecord[]; logs: Record<string, LogRecord[]> }) {
  const [date, setDate] = useState(today);
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const days = calendarDays(date, view);
  const stats = rangeStats(habits, logs, days[0], days[days.length - 1], today);
  const entries = habits.flatMap((habit) => (logs[habit.id] ?? [])
    .filter((log) => !log.deletedAt)
    .map((log) => ({ habit, log })));
  const selected = entries.filter(({ log }) => log.logicalDate === date)
    .sort((a, b) => b.log.occurredAt.localeCompare(a.log.occurredAt));
  const move = (direction: number) => {
    if (view === 'day') setDate(addDays(date, direction));
    else if (view === 'week') setDate(addDays(date, 7 * direction));
    else {
      const first = `${date.slice(0, 7)}-01`;
      setDate(direction < 0 ? `${addDays(first, -1).slice(0, 7)}-01` : `${addDays(first, 32).slice(0, 7)}-01`);
    }
  };
  return (
    <section className="card">
      <h2>Calendar</h2>
      <div className="view-toggle" aria-label="Calendar view">
        {(['day', 'week', 'month'] as const).map((mode) => <button key={mode} type="button" className={view === mode ? 'active' : ''} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode}</button>)}
      </div>
      <div className="datebar">
        <button type="button" aria-label={`Previous ${view}`} onClick={() => move(-1)}>‹</button>
        <strong>{view === 'month' ? date.slice(0, 7) : view === 'week' ? `${days[0]} – ${days[6]}` : date}</strong>
        <button type="button" aria-label={`Next ${view}`} onClick={() => move(1)}>›</button>
        <button type="button" onClick={() => setDate(today)}>Today</button>
      </div>
      <p aria-label="Period statistics">{stats.due === 0 ? 'No habits due in this period.' : `${stats.done}/${stats.due} done · ${stats.rate}% · ${stats.activeDays} active ${stats.activeDays === 1 ? 'day' : 'days'}`}</p>
      {view !== 'day' && <div className="calendar-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => <strong key={label}>{label}</strong>)}
        {days.map((day) => {
          const count = entries.filter(({ log }) => log.logicalDate === day).length;
          return <button key={day} type="button" aria-pressed={day === date} aria-label={`${day}, ${count} activities`} onClick={() => setDate(day)}>{Number(day.slice(-2))}{count > 0 && <small>{count} •</small>}</button>;
        })}
      </div>}
      <h3>{date}</h3>
      {selected.length === 0 ? <p>No activity on this day.</p> : <ul className="history-list">{selected.map(({ habit, log }) => <li key={log.id} className="history-item"><strong>{habit.icon} {habit.name}</strong>{' · '}{log.kind === 'complete' ? `${log.value} ${habit.unit ?? ''}` : log.kind}{log.note && <p>{log.note}</p>}</li>)}</ul>}
    </section>
  );
}
