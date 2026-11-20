import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canLog,
  checkInWithReward,
  clearDay,
  clearRelapse,
  freezeDay,
  relapse,
  removeExcusedDay,
  RETRO_DAYS,
  skipDay,
  undoCheckIn,
} from '@habit/core/checkin';
import { heatmapLevels } from '@habit/core/heatmap';
import { addDays, startOfIsoWeek, type LogicalDate } from '@habit/core/logical-date';
import type { HabitRecord, LogRecord } from '@habit/core/repo';
import { applyXp, createDefaultPlayerProfile } from '@habit/core/gamification';
import { summarize } from '@habit/core/summary';
import { HabitDetailModal } from '../components/HabitDetailModal.tsx';
import { HabitRow } from '../components/HabitRow.tsx';
import { Heatmap } from '../components/Heatmap.tsx';
import { Calendar } from '../components/Calendar.tsx';
import { Tasks } from '../components/Tasks.tsx';
import { PlayerHud } from '../components/PlayerHud.tsx';
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
  const [rewards, setRewards] = useState<{ xp: number; gold: number }[]>([]);
  const [rewardMessage, setRewardMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailHabit, setDetailHabit] = useState<HabitRecord | null>(null);
  const [viewArchived, setViewArchived] = useState(false);
  const [view, setView] = useState<'habits' | 'journal' | 'calendar' | 'tasks'>('habits');
  const [journalHabit, setJournalHabit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const date = addDays(today, -offset);

  const reload = useCallback(async () => {
    const list = await repo.listHabits();
    const entries = await Promise.all(list.map(async (habit) => [habit.id, await repo.listLogs(habit.id)] as const));
    setHabits(list);
    setLogs(Object.fromEntries(entries));
    setRewards(await repo.listRewards());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Remote changes merged by sync land in the repo; refresh when they do.
  useEffect(() => repo.subscribe(() => void reload()), [reload]);

  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    try {
      setError(null);
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
    }
  };

  const rewardedCheckIn = async (habit: HabitRecord, note?: string, amount?: number) => {
    const reward = await checkInWithReward(repo, habit, date, today, new Date(), note, amount);
    setRewardMessage(reward ? `Earned ${reward.xp} XP and ${reward.gold} Gold` : '');
  };

  const totalXp = rewards.reduce((sum, reward) => sum + reward.xp, 0);
  const totalGold = rewards.reduce((sum, reward) => sum + reward.gold, 0);
  const player = { ...applyXp(createDefaultPlayerProfile('local-player'), totalXp).updatedPlayer, gold: totalGold };

  const activeHabits = useMemo(() => habits.filter((h) => !h.archivedAt), [habits]);
  const archivedHabits = useMemo(() => habits.filter((h) => !!h.archivedAt), [habits]);
  const displayedHabits = viewArchived ? archivedHabits : activeHabits;
  const journal = habits.flatMap((habit) => (logs[habit.id] ?? [])
    .filter((log) => !log.deletedAt && log.note?.trim() && (!journalHabit || habit.id === journalHabit))
    .map((log) => ({ habit, log })))
    .sort((a, b) => b.log.logicalDate.localeCompare(a.log.logicalDate) || b.log.occurredAt.localeCompare(a.log.occurredAt));

  const rows = useMemo(
    () => displayedHabits.map((habit) => ({ habit, summary: summarize(habit, logs[habit.id] ?? [], date, today) })),
    [displayedHabits, logs, date, today],
  );
  const dueRows = rows.filter((row) => row.summary.due);
  const otherRows = rows.filter((row) => !row.summary.due);
  const selected = habits.find((habit) => habit.id === selectedId) ?? displayedHabits[0];
  const cells = selected
    ? heatmapLevels(
        { startDate: selected.startDate, target: selected.target, schedule: selected.schedule, quit: selected.quit },
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
        onToggle={() => run(() => (habit.quit
          ? (summary.done ? relapse(repo, habit, date, today) : clearRelapse(repo, habit, date))
          : summary.done ? clearDay(repo, habit, date) : rewardedCheckIn(habit)))}
        onPlus={() => run(() => rewardedCheckIn(habit))}
        onMinus={() => run(() => undoCheckIn(repo, habit, date))}
      />
    );
  };

  return (
    <>
      <PlayerHud player={player} />
      <p role="status" aria-live="polite">{rewardMessage}</p>
      <nav className="view-toggle" aria-label="Habit views">
        <button type="button" className={view === 'habits' ? 'active' : ''} aria-pressed={view === 'habits'} onClick={() => setView('habits')}>Habits</button>
        <button type="button" className={view === 'journal' ? 'active' : ''} aria-pressed={view === 'journal'} onClick={() => setView('journal')}>Journal</button>
        <button type="button" className={view === 'calendar' ? 'active' : ''} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</button>
        <button type="button" className={view === 'tasks' ? 'active' : ''} aria-pressed={view === 'tasks'} onClick={() => setView('tasks')}>Tasks</button>
      </nav>
      {view === 'tasks' ? <Tasks today={today} /> : view === 'calendar' ? <Calendar today={today} habits={habits} logs={logs} /> : view === 'journal' ? (
        <section className="card">
          <h2>Journal</h2>
          <label>Habit{' '}
            <select value={journalHabit} onChange={(e) => setJournalHabit(e.target.value)}>
              <option value="">All habits</option>
              {habits.map((habit) => <option key={habit.id} value={habit.id}>{habit.name}{habit.archivedAt ? ' (Archived)' : ''}</option>)}
            </select>
          </label>
          {journal.length === 0 ? <p>No notes yet. Add a note in a habit's details when checking in.</p> : (
            <ul className="history-list">
              {journal.map(({ habit, log }) => (
                <li key={log.id} className="history-item">
                  <strong>{habit.icon} {habit.name}</strong>{' · '}
                  <time dateTime={log.logicalDate}>{log.logicalDate}</time>{' · '}
                  <span>{log.kind === 'complete' ? 'Check-in' : log.kind === 'skip' ? 'Skipped' : 'Frozen'}</span>
                  <p>{log.note}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (<>
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
          onToggle={(note) =>
            run(() => {
              const summary = summarize(detailHabit, logs[detailHabit.id] ?? [], date, today);
              if (detailHabit.quit) {
                return summary.done ? relapse(repo, detailHabit, date, today, note) : clearRelapse(repo, detailHabit, date);
              }
              return summary.done
                ? clearDay(repo, detailHabit, date)
                : rewardedCheckIn(detailHabit, note);
            })
          }
          onPlus={(note) => run(() => rewardedCheckIn(detailHabit, note))}
          onTimerLog={(minutes) => run(() => rewardedCheckIn(detailHabit, undefined, minutes))}
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
      </>)}
    </>
  );
}
