import { useCallback, useEffect, useMemo, useState } from 'react';
import { canLog, checkIn, clearDay, RETRO_DAYS, undoCheckIn } from '@habit/core/checkin';
import { heatmapLevels } from '@habit/core/heatmap';
import { addDays, startOfIsoWeek, type LogicalDate } from '@habit/core/logical-date';
import type { HabitRecord, LogRecord } from '@habit/core/repo';
import { summarize } from '@habit/core/summary';
import { HabitRow } from '../components/HabitRow.tsx';
import { Heatmap } from '../components/Heatmap.tsx';
import { repo } from '../repo-local.ts';

export function Today({ today, onAdd }: { today: LogicalDate; onAdd(): void }) {
  const [habits, setHabits] = useState<HabitRecord[]>([]);
  const [logs, setLogs] = useState<Record<string, LogRecord[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const date = addDays(today, -offset);

  const reload = useCallback(async () => {
    const list = await repo.listHabits();
    const entries = await Promise.all(list.map(async (habit) => [habit.id, await repo.listLogs(habit.id)] as const));
    setHabits(list);
    setLogs(Object.fromEntries(entries));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (action: () => Promise<void>) => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const rows = useMemo(
    () => habits.map((habit) => ({ habit, summary: summarize(habit, logs[habit.id] ?? [], date, today) })),
    [habits, logs, date, today],
  );
  const dueRows = rows.filter((row) => row.summary.due);
  const otherRows = rows.filter((row) => !row.summary.due);
  const selected = habits.find((habit) => habit.id === selectedId) ?? habits[0];
  const cells = selected
    ? heatmapLevels(
        { startDate: selected.startDate, target: selected.target, schedule: selected.schedule },
        logs[selected.id] ?? [],
        addDays(startOfIsoWeek(today), -25 * 7),
        today,
      )
    : [];

  const renderRow = ({ habit, summary }: (typeof rows)[number]) => (
    <HabitRow
      key={habit.id}
      habit={habit}
      summary={summary}
      canEdit={canLog(habit, date, today)}
      selected={habit.id === selected?.id}
      onSelect={() => setSelectedId(habit.id)}
      onToggle={() => run(() => (summary.done ? clearDay(repo, habit, date) : checkIn(repo, habit, date, today)))}
      onPlus={() => run(() => checkIn(repo, habit, date, today))}
      onMinus={() => run(() => undoCheckIn(repo, habit, date))}
    />
  );

  return (
    <>
      <div className="datebar">
        <button aria-label="Previous day" disabled={offset >= RETRO_DAYS} onClick={() => setOffset(offset + 1)}>
          ‹
        </button>
        <strong>{offset === 0 ? `Today · ${date}` : date}</strong>
        <button aria-label="Next day" disabled={offset === 0} onClick={() => setOffset(offset - 1)}>
          ›
        </button>
        <button className="primary" onClick={onAdd}>
          + Add habit
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loaded && habits.length === 0 ? (
        <div className="card empty">
          <p>Nothing to track yet.</p>
          <button className="primary" onClick={onAdd}>
            Add your first habit
          </button>
        </div>
      ) : (
        <>
          {dueRows.length > 0 && dueRows.every((row) => row.summary.done) && (
            <p className="all-done">All done for today. Nice work!</p>
          )}
          <ul className="rows">{dueRows.map(renderRow)}</ul>
          {otherRows.length > 0 && (
            <details>
              <summary>Not today ({otherRows.length})</summary>
              <ul className="rows">{otherRows.map(renderRow)}</ul>
            </details>
          )}
        </>
      )}

      {selected && (
        <section className="card">
          <h2>{selected.name}</h2>
          <Heatmap cells={cells} />
        </section>
      )}
    </>
  );
}
