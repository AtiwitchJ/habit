import type { HabitRecord } from '@habit/core/repo';
import type { HabitSummary } from '@habit/core/summary';

interface Props {
  habit: HabitRecord;
  summary: HabitSummary;
  canEdit: boolean;
  selected: boolean;
  onSelect(): void;
  onToggle(): void;
  onPlus(): void;
  onMinus(): void;
}

export function HabitRow({ habit, summary, canEdit, selected, onSelect, onToggle, onPlus, onMinus }: Props) {
  const unit = habit.schedule.type === 'times_per_week' ? 'wk' : 'd';
  return (
    <li className={`row${selected ? ' selected' : ''}`}>
      <button className="name" onClick={onSelect}>
        <span>{habit.name}</span>
        <small>
          {summary.streak.current} {unit} streak
        </small>
      </button>
      {habit.kind === 'boolean' ? (
        <button className="check" aria-pressed={summary.done} disabled={!canEdit} onClick={onToggle}>
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
