import { useState } from 'react';
import { RETRO_DAYS, stepFor } from '@habit/core/checkin';
import { addDays, assertLogicalDate, type LogicalDate } from '@habit/core/logical-date';
import { HUES, type HabitRecord, type Hue } from '@habit/core/repo';
import type { Schedule } from '@habit/core/streak';
import { repo } from '../repo-local.ts';

const firstEmoji = (text: string): string =>
  new Intl.Segmenter().segment(text.trim())[Symbol.iterator]().next().value?.segment ?? '';

const DAY_LABELS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 7, label: 'Sun' },
];

export function EditHabit({
  habit,
  today,
  onDone,
  onCancel,
}: {
  habit: HabitRecord;
  today: LogicalDate;
  onDone(): void;
  onCancel(): void;
}) {
  const [name, setName] = useState(habit.name);
  const [icon, setIcon] = useState(habit.icon ?? '');
  const [color, setColor] = useState<Hue>(habit.color ?? 'green');
  const [kind, setKind] = useState<'boolean' | 'quantitative'>(habit.kind);
  const [target, setTarget] = useState(habit.target);
  const [unit, setUnit] = useState(habit.unit ?? '');
  const [step, setStep] = useState(habit.step !== undefined ? String(habit.step) : '');
  const [scheduleType, setScheduleType] = useState<Schedule['type']>(habit.schedule.type);
  const [selectedDays, setSelectedDays] = useState<number[]>(
    habit.schedule.type === 'weekdays' ? habit.schedule.days : [1, 2, 3, 4, 5],
  );
  const [periodCount, setPeriodCount] = useState<number>(
    'count' in habit.schedule ? habit.schedule.count : 3,
  );
  const [quit, setQuit] = useState(habit.quit ?? false);
  const [inSupplements, setInSupplements] = useState(habit.group === 'supplements');
  const [startDate, setStartDate] = useState(habit.startDate);
  const [reminderTimes, setReminderTimes] = useState<string[]>(habit.reminderTimes ?? (habit.reminderTime ? [habit.reminderTime] : []));
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? (prev.length > 1 ? prev.filter((d) => d !== day) : prev) : [...prev, day].sort(),
    );
  };

  const computeSchedule = (): Schedule => {
    if (scheduleType === 'weekdays') return { type: 'weekdays', days: selectedDays };
    if (scheduleType === 'times_per_week' || scheduleType === 'times_per_month' || scheduleType === 'times_per_year') {
      return { type: scheduleType, count: periodCount };
    }
    return { type: 'daily' };
  };

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) return setError('Name is required.');
    const max = scheduleType === 'times_per_week' ? 7 : scheduleType === 'times_per_month' ? 31 : 366;
    if (scheduleType.startsWith('times_per_') && !(Number.isInteger(periodCount) && periodCount >= 1 && periodCount <= max)) {
      return setError(`Choose between 1 and ${max} times.`);
    }
    if (kind === 'quantitative' && !(target > 0)) return setError('Target must be greater than 0.');
    if (kind === 'quantitative' && !unit.trim()) return setError('Unit is required.');
    if (kind === 'quantitative' && step !== '' && !(Number(step) > 0)) {
      return setError('Each tap must add more than 0.');
    }
    try {
      assertLogicalDate(startDate);
    } catch {
      return setError('Start date is invalid.');
    }
    if (startDate > today || startDate < addDays(today, -RETRO_DAYS)) {
      return setError(`Start date must be within the last ${RETRO_DAYS} days.`);
    }
    if (reminderTimes.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return setError('Choose a valid time for each reminder.');
    if (new Set(reminderTimes).size !== reminderTimes.length) return setError('Reminder times must be different.');

    await repo.updateHabit(habit.id, {
      name: trimmedName,
      icon: icon || undefined,
      color,
      kind: quit ? 'boolean' : kind,
      quit: quit || undefined,
      target: quit || kind === 'boolean' ? 1 : target,
      unit: kind === 'quantitative' ? unit.trim() : undefined,
      step: kind === 'quantitative' && step !== '' ? Number(step) : undefined,
      schedule: quit ? { type: 'daily' } : computeSchedule(),
      startDate,
      group: inSupplements ? 'supplements' : undefined,
      reminderTime: reminderTimes[0],
      reminderTimes: [...reminderTimes].sort(),
    });
    onDone();
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        void save();
      }}
    >
      <div className="datebar">
        <h2>Edit habit</h2>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>

      <label className="field"><input type="checkbox" checked={inSupplements} onChange={(e) => setInSupplements(e.target.checked)} /> In Supplements group</label>

      <label className="field">
        <span>Icon (one emoji)</span>
        <input value={icon} onChange={(e) => setIcon(firstEmoji(e.target.value))} placeholder="🙂" />
      </label>

      <div className="field">
        <span>Color</span>
        <div className="swatches">
          {HUES.map((hue) => (
            <button
              key={hue}
              type="button"
              className={`hue-${hue}`}
              aria-label={hue}
              aria-pressed={color === hue}
              onClick={() => setColor(hue)}
            />
          ))}
        </div>
      </div>

      <label className="field">
        <span>Quit a habit</span>
        <input type="checkbox" checked={quit} onChange={(e) => { setQuit(e.target.checked); if (e.target.checked) setKind('boolean'); }} />
        <small>Counts clean days; log a slip to reset the streak.</small>
      </label>

      <label className="field">
        <span>Type</span>
        <select
          value={kind}
          onChange={(e) => {
            const next = e.target.value as 'boolean' | 'quantitative';
            setKind(next);
            if (next === 'boolean') setTarget(1);
            else if (target === 1) setTarget(10);
          }}
        >
          <option value="boolean">Yes / no</option>
          <option value="quantitative">Amount</option>
        </select>
      </label>

      {!quit && kind === 'quantitative' && (
        <>
          <label className="field">
            <span>Daily target</span>
            <input type="number" min="1" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Unit</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ml, pages, mins" />
          </label>
          <label className="field">
            <span>Each tap adds</span>
            <input
              type="number"
              min="0"
              step="any"
              value={step}
              onChange={(e) => setStep(e.target.value)}
              placeholder={`${stepFor({ kind: 'quantitative', target })} ${unit} (auto)`}
            />
          </label>
        </>
      )}

      {!quit && <div className="field">
        <span>Schedule</span>
        <div className="chips">
          <button
            type="button"
            aria-pressed={scheduleType === 'daily'}
            onClick={() => setScheduleType('daily')}
          >
            Every day
          </button>
          <button
            type="button"
            aria-pressed={scheduleType === 'weekdays'}
            onClick={() => setScheduleType('weekdays')}
          >
            Specific days
          </button>
          <button
            type="button"
            aria-pressed={scheduleType === 'times_per_week'}
            onClick={() => setScheduleType('times_per_week')}
          >
            Times per week
          </button>
          <button type="button" aria-pressed={scheduleType === 'times_per_month'} onClick={() => setScheduleType('times_per_month')}>
            Times per month
          </button>
          <button type="button" aria-pressed={scheduleType === 'times_per_year'} onClick={() => setScheduleType('times_per_year')}>
            Times per year
          </button>
        </div>
      </div>}

      {scheduleType === 'weekdays' && (
        <div className="field">
          <span>Repeat on</span>
          <div className="chips">
            {DAY_LABELS.map(({ day, label }) => (
              <button
                key={day}
                type="button"
                aria-pressed={selectedDays.includes(day)}
                onClick={() => toggleDay(day)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!quit && scheduleType.startsWith('times_per_') && (
        <label className="field">
          <span>Times per {scheduleType.slice('times_per_'.length)}</span>
          <input type="number" min="1" max={scheduleType === 'times_per_week' ? 7 : scheduleType === 'times_per_month' ? 31 : 366} value={periodCount} onChange={(e) => setPeriodCount(Number(e.target.value))} />
        </label>
      )}

      <label className="field">
        <span>Started on</span>
        <input
          type="date"
          value={startDate}
          min={addDays(today, -RETRO_DAYS)}
          max={today}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>

      <div className="field">
        <span>Reminder times</span>
        {reminderTimes.map((time, index) => (
          <div className="actions" key={index}>
            <label>Reminder {index + 1}{' '}
              <input type="time" value={time} onChange={(e) => setReminderTimes((times) => times.map((value, i) => i === index ? e.target.value : value))} />
            </label>
            <button type="button" onClick={() => setReminderTimes((times) => times.filter((_, i) => i !== index))}>Remove reminder {index + 1}</button>
          </div>
        ))}
        <button type="button" onClick={() => setReminderTimes((times) => [...times, ''])}>Add reminder</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button type="submit" className="primary">
          Save changes
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
