import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  canLog,
  checkIn,
  clearDay,
  freezeDay,
  removeExcusedDay,
  RETRO_DAYS,
  skipDay,
  undoCheckIn,
} from '@habit/core/checkin';
import { heatmapLevels } from '@habit/core/heatmap';
import { addDays, startOfIsoWeek, type LogicalDate } from '@habit/core/logical-date';
import type { HabitRecord, LogRecord } from '@habit/core/repo';
import { summarize } from '@habit/core/summary';
import { HabitDetailModal } from '../components/HabitDetailModal.tsx';
import { HabitRow } from '../components/HabitRow.tsx';
import { Heatmap } from '../components/Heatmap.tsx';
import { repo } from '../repo-local.ts';

export function Today({
  today,
  onAdd,
  onEdit,
}: {
  today: LogicalDate;
  onAdd(): void;
  onEdit?(habit: HabitRecord): void;
}) {
  const [habits, setHabits] = useState<HabitRecord[]>([]);
  const [logs, setLogs] = useState<Record<string, LogRecord[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailHabit, setDetailHabit] = useState<HabitRecord | null>(null);
  const [viewArchived, setViewArchived] = useState(false);
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

  // Remote changes merged by sync land in the repo; refresh when they do.
  useEffect(() => repo.subscribe(() => void reload()), [reload]);

  const run = async (action: () => Promise<void>) => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const activeHabits = useMemo(() => habits.filter((h) => !h.archivedAt), [habits]);
  const archivedHabits = useMemo(() => habits.filter((h) => !!h.archivedAt), [habits]);
  const displayedHabits = viewArchived ? archivedHabits : activeHabits;

  const rows = useMemo(
    () => displayedHabits.map((habit) => ({ habit, summary: summarize(habit, logs[habit.id] ?? [], date, today) })),
    [displayedHabits, logs, date, today],
  );
  const dueRows = rows.filter((row) => row.summary.due);
  const otherRows = rows.filter((row) => !row.summary.due);
  const selected = habits.find((habit) => habit.id === selectedId) ?? displayedHabits[0];
  const cells = selected
    ? heatmapLevels(
        { startDate: selected.startDate, target: selected.target, schedule: selected.schedule },
        logs[selected.id] ?? [],
        addDays(startOfIsoWeek(today), -25 * 7),
        today,
      )
    : [];

  const renderRow = ({ habit, summary }: (typeof rows)[number]) => {
    const habitLogs = logs[habit.id] ?? [];
    const isSkipped = habitLogs.some((l) => !l.deletedAt && l.kind === 'skip' && l.logicalDate === date);
    const isFrozen = habitLogs.some((l) => !l.deletedAt && l.kind === 'freeze' && l.logicalDate === date);

    return (
      <HabitRow
        key={habit.id}
        habit={habit}
        summary={summary}
        canEdit={canLog(habit, date, today)}
        selected={habit.id === selected?.id}
        isSkipped={isSkipped}
        isFrozen={isFrozen}
        onSelect={() => setSelectedId(habit.id)}
        onOpenDetail={() => setDetailHabit(habit)}
        onToggle={() => run(() => (summary.done ? clearDay(repo, habit, date) : checkIn(repo, habit, date, today)))}
        onPlus={() => run(() => checkIn(repo, habit, date, today))}
        onMinus={() => run(() => undoCheckIn(repo, habit, date))}
      />
    );
  };

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

      {archivedHabits.length > 0 && (
        <div className="view-toggle">
          <button
            type="button"
            className={!viewArchived ? 'active' : ''}
            onClick={() => setViewArchived(false)}
          >
            Active habits ({activeHabits.length})
          </button>
          <button
            type="button"
            className={viewArchived ? 'active' : ''}
            onClick={() => setViewArchived(true)}
          >
            Archived ({archivedHabits.length})
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {loaded && displayedHabits.length === 0 ? (
        <div className="card empty">
          <p>{viewArchived ? 'No archived habits.' : 'Nothing to track yet.'}</p>
          {!viewArchived && (
            <button className="primary" onClick={onAdd}>
              Add your first habit
            </button>
          )}
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

      {selected && !detailHabit && (
        <section className="card">
          <h2>
            {selected.icon} {selected.name}
          </h2>
          <Heatmap cells={cells} hue={selected.color} />
        </section>
      )}

      {detailHabit && (
        <HabitDetailModal
          habit={detailHabit}
          logs={logs[detailHabit.id] ?? []}
          today={today}
          selectedDate={date}
          onClose={() => setDetailHabit(null)}
          onEdit={(h) => {
            setDetailHabit(null);
            onEdit?.(h);
          }}
          onToggle={() =>
            run(() => {
              const summary = summarize(detailHabit, logs[detailHabit.id] ?? [], date, today);
              return summary.done
                ? clearDay(repo, detailHabit, date)
                : checkIn(repo, detailHabit, date, today);
            })
          }
          onPlus={() => run(() => checkIn(repo, detailHabit, date, today))}
          onMinus={() => run(() => undoCheckIn(repo, detailHabit, date))}
          onSkip={(note) => run(() => skipDay(repo, detailHabit, date, today, note))}
          onFreeze={(note) => run(() => freezeDay(repo, detailHabit, date, today, note))}
          onClearExcused={() => run(() => removeExcusedDay(repo, detailHabit, date))}
          onArchive={() =>
            run(async () => {
              await repo.updateHabit(detailHabit.id, {
                archivedAt: detailHabit.archivedAt ? null : new Date().toISOString(),
              });
              setDetailHabit(null);
            })
          }
          onDelete={() =>
            run(async () => {
              await repo.removeHabit(detailHabit.id);
              setDetailHabit(null);
            })
          }
        />
      )}
    </>
  );
}
