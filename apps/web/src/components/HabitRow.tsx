import type { HabitRecord } from '@habit/core/repo';
import type { HabitSummary } from '@habit/core/summary';

interface Props {
  habit: HabitRecord;
  summary: HabitSummary;
  canEdit: boolean;
  selected: boolean;
  isSkipped?: boolean;
  isFrozen?: boolean;
  onSelect(): void;
  onOpenDetail(): void;
  onToggle(): void;
  onPlus(): void;
  onMinus(): void;
}

export function HabitRow({
  habit,
  summary,
  canEdit,
  selected,
  isSkipped,
  isFrozen,
  onSelect,
  onOpenDetail,
  onToggle,
  onPlus,
  onMinus,
}: Props) {
  const unit = habit.schedule.type === 'times_per_week' ? 'wk' : 'd';
  return (
    <li className={`row hue-${habit.color ?? 'green'}${selected ? ' selected' : ''}`}>
      <button
        className="name"
        onClick={() => {
          onSelect();
          onOpenDetail();
        }}
      >
        <span>
          {habit.icon && <i aria-hidden="true">{habit.icon}</i>}
          {habit.name}
        </span>
        <small>
          {summary.streak.current} {unit} streak
          {habit.archivedAt && ' · (Archived)'}
        </small>
      </button>
      {isSkipped || isFrozen ? (
        <button className="excused-tag" onClick={onOpenDetail} title="Excused day. Tap to view or edit.">
          {isSkipped ? '⏸️ Skipped' : '❄️ Frozen'}
        </button>
      ) : habit.kind === 'boolean' ? (
        <button
          className="check"
          aria-pressed={summary.done}
          aria-label={summary.done ? `${habit.name} done, tap to undo` : `Mark ${habit.name} done`}
          title={summary.done ? 'Tap to undo' : 'Mark done'}
          disabled={!canEdit}
          onClick={onToggle}
        >
          {summary.done ? 'Done' : 'Mark done'}
        </button>
      ) : (
        <div className="stepper">
          <button aria-label={`Remove one step from ${habit.name}`} disabled={!canEdit || summary.value === 0} onClick={onMinus}>
            −
          </button>
          <span className={summary.done ? 'done' : ''}>
            {summary.value} / {habit.target} {habit.unit}
          </span>
          <button aria-label={`Add one step to ${habit.name}`} disabled={!canEdit} onClick={onPlus}>
            +
          </button>
        </div>
      )}
    </li>
  );
}
