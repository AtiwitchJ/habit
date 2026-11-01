import { useMemo, useState } from 'react';
import { heatmapLevels } from '@habit/core/heatmap';
import { addDays, startOfIsoWeek, type LogicalDate } from '@habit/core/logical-date';
import type { HabitRecord, LogRecord } from '@habit/core/repo';
import { computeHabitStats, type HabitDetailStats } from '@habit/core/summary';
import { Heatmap } from './Heatmap.tsx';

interface Props {
  habit: HabitRecord;
  logs: LogRecord[];
  today: LogicalDate;
  selectedDate: LogicalDate;
  onClose(): void;
  onEdit(habit: HabitRecord): void;
  onToggle(): void;
  onPlus(): void;
  onMinus(): void;
  onSkip(note?: string): void;
  onFreeze(note?: string): void;
  onClearExcused(): void;
  onArchive(): void;
  onDelete(): void;
}

export function HabitDetailModal({
  habit,
  logs,
  today,
  selectedDate,
  onClose,
  onEdit,
  onToggle,
  onPlus,
  onMinus,
  onSkip,
  onFreeze,
  onClearExcused,
  onArchive,
  onDelete,
}: Props) {
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stats: HabitDetailStats = useMemo(
    () => computeHabitStats(habit, logs, today),
    [habit, logs, today],
  );

  const cells = useMemo(
    () =>
      heatmapLevels(
        { startDate: habit.startDate, target: habit.target, schedule: habit.schedule },
        logs,
        addDays(startOfIsoWeek(today), -25 * 7),
        today,
      ),
    [habit, logs, today],
  );

  const dayLogs = useMemo(
    () => logs.filter((l) => !l.deletedAt && l.logicalDate === selectedDate),
    [logs, selectedDate],
  );

  const daySum = dayLogs
    .filter((l) => l.kind === 'complete')
    .reduce((sum, l) => sum + l.value, 0);

  const isDone = daySum >= habit.target;
  const skipLog = dayLogs.find((l) => l.kind === 'skip');
  const freezeLog = dayLogs.find((l) => l.kind === 'freeze');
  const isExcused = !!(skipLog || freezeLog);

  const recentLogs = useMemo(() => {
    return [...logs]
      .filter((l) => !l.deletedAt)
      .sort((a, b) => (b.logicalDate > a.logicalDate ? 1 : -1))
      .slice(0, 10);
  }, [logs]);

  const unitLabel = habit.schedule.type === 'times_per_week' ? 'wk' : 'd';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-content hue-${habit.color ?? 'green'}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="title-group">
            {habit.icon && <span className="modal-icon">{habit.icon}</span>}
            <div>
              <h3>{habit.name}</h3>
              <p className="subtitle">
                {habit.kind === 'quantitative' ? `${habit.target} ${habit.unit ?? ''}` : 'Daily habit'} ·{' '}
                {habit.schedule.type === 'daily'
                  ? 'Every day'
                  : habit.schedule.type === 'weekdays'
                  ? 'Specific days'
                  : `${habit.schedule.count}× / week`}
              </p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-num">
              {stats.currentStreak} <small>{unitLabel}</small>
            </span>
            <span className="stat-label">Current Streak</span>
          </div>
          <div className="stat-card">
            <span className="stat-num">
              {stats.longestStreak} <small>{unitLabel}</small>
            </span>
            <span className="stat-label">Best Streak</span>
          </div>
          <div className="stat-card">
            <span className="stat-num">{stats.completionRate30d}%</span>
            <span className="stat-label">30d Rate</span>
          </div>
          <div className="stat-card">
            <span className="stat-num">{stats.totalCompletions}</span>
            <span className="stat-label">Total Done</span>
          </div>
        </div>

        {/* Selected Day Status & Actions */}
        <div className="day-action-card">
          <h4>Status on {selectedDate === today ? `Today (${selectedDate})` : selectedDate}</h4>

          {isExcused ? (
            <div className="excused-banner">
              <p>
                {skipLog ? '⏸️ Day marked as Skipped' : '❄️ Day marked as Frozen (Streak protected)'}
                {(skipLog?.note || freezeLog?.note) && (
                  <span className="note-text"> — "{skipLog?.note ?? freezeLog?.note}"</span>
                )}
              </p>
              <button className="secondary small" onClick={onClearExcused}>
                Remove Excuse & Resume
              </button>
            </div>
          ) : (
            <div className="progress-section">
              {habit.kind === 'boolean' ? (
                <div className="boolean-actions">
                  <button
                    className={`primary full ${isDone ? 'done-btn' : ''}`}
                    onClick={onToggle}
                  >
                    {isDone ? '✓ Completed (tap to undo)' : 'Mark Done for this day'}
                  </button>
                </div>
              ) : (
                <div className="stepper-action">
                  <div className="stepper-display">
                    <button disabled={daySum <= 0} onClick={onMinus}>
                      −
                    </button>
                    <span className={isDone ? 'done' : ''}>
                      {daySum} / {habit.target} {habit.unit}
                    </span>
                    <button onClick={onPlus}>+</button>
                  </div>
                </div>
              )}

              {/* Excuse / Notes Toggle */}
              <div className="excuse-row">
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => {
                    onSkip(note.trim() || undefined);
                    setNote('');
                  }}
                >
                  ⏸️ Skip day
                </button>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => {
                    onFreeze(note.trim() || undefined);
                    setNote('');
                  }}
                >
                  ❄️ Freeze streak
                </button>
                <button
                  type="button"
                  className="chip-btn text"
                  onClick={() => setShowNoteInput(!showNoteInput)}
                >
                  📝 {showNoteInput ? 'Hide note' : 'Add note'}
                </button>
              </div>

              {showNoteInput && (
                <div className="note-field">
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional check-in note (e.g. sick, travel, great workout)..."
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 26-Week Heatmap */}
        <div className="heatmap-section">
          <h4>Consistency (Last 26 Weeks)</h4>
          <Heatmap cells={cells} hue={habit.color ?? 'green'} />
        </div>

        {/* Recent History */}
        {recentLogs.length > 0 && (
          <div className="history-section">
            <h4>Recent Activity</h4>
            <ul className="history-list">
              {recentLogs.map((log) => (
                <li key={log.id} className="history-item">
                  <span className="log-date">{log.logicalDate}</span>
                  <span className={`log-badge badge-${log.kind}`}>
                    {log.kind === 'complete'
                      ? habit.kind === 'quantitative'
                        ? `+${log.value} ${habit.unit ?? ''}`
                        : 'Done'
                      : log.kind === 'skip'
                      ? 'Skipped'
                      : 'Frozen'}
                  </span>
                  {log.note && <span className="log-note">"{log.note}"</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onClose();
              onEdit(habit);
            }}
          >
            ✏️ Edit habit
          </button>
          <button type="button" className="secondary" onClick={onArchive}>
            {habit.archivedAt ? '📂 Unarchive habit' : '📦 Archive habit'}
          </button>
          {confirmDelete ? (
            <div className="confirm-delete-box">
              <span>Are you sure?</span>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
              >
                Yes, Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="danger"
              onClick={() => setConfirmDelete(true)}
            >
              🗑️ Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
