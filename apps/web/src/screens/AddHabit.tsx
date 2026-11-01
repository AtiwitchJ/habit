import { useState } from 'react';
import { RETRO_DAYS } from '@habit/core/checkin';
import { addDays, assertLogicalDate, type LogicalDate } from '@habit/core/logical-date';
import type { Schedule } from '@habit/core/streak';
import { templatesByCategory, type HabitTemplate } from '@habit/core/templates';
import { repo } from '../repo-local.ts';

interface Draft {
  name: string;
  kind: 'boolean' | 'quantitative';
  target: number;
  unit: string;
  schedule: Schedule;
  startDate: string;
  templateId?: string;
  reminderTime?: string;
  custom: boolean;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function describe(schedule: Schedule): string {
  if (schedule.type === 'daily') return 'Every day';
  if (schedule.type === 'weekdays') return schedule.days.map((d) => DAY_NAMES[d - 1]).join(', ');
  return `${schedule.count}× per week`;
}

function fromTemplate(t: HabitTemplate, today: LogicalDate): Draft {
  return { name: t.name, kind: t.kind, target: t.target, unit: t.unit ?? '', schedule: t.schedule, startDate: today, templateId: t.id, reminderTime: t.reminderTime, custom: false };
}

function blankCustom(today: LogicalDate): Draft {
  return { name: '', kind: 'boolean', target: 1, unit: '', schedule: { type: 'daily' }, startDate: today, custom: true };
}

export function AddHabit({ today, onDone, onCancel }: { today: LogicalDate; onDone(): void; onCancel(): void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(d: Draft) {
    const name = d.name.trim();
    if (!name) return setError('Name is required.');
    if (d.kind === 'quantitative' && !(d.target > 0)) return setError('Target must be greater than 0.');
    if (d.kind === 'quantitative' && !d.unit.trim()) return setError('Unit is required.');
    try {
      assertLogicalDate(d.startDate);
    } catch {
      return setError('Start date is invalid.');
    }
    if (d.startDate > today || d.startDate < addDays(today, -RETRO_DAYS)) {
      return setError(`Start date must be within the last ${RETRO_DAYS} days.`);
    }
    await repo.addHabit({
      name,
      kind: d.kind,
      target: d.kind === 'boolean' ? 1 : d.target,
      unit: d.kind === 'quantitative' ? d.unit.trim() : undefined,
      schedule: d.schedule,
      startDate: d.startDate,
      templateId: d.templateId,
      reminderTime: d.reminderTime,
    });
    onDone();
  }

  if (draft) {
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
    return (
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          void save(draft);
        }}
      >
        <h2>{draft.custom ? 'Custom habit' : 'New habit'}</h2>
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </label>
        {draft.custom && (
          <label className="field">
            <span>Type</span>
            <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as Draft['kind'], target: e.target.value === 'boolean' ? 1 : 10 })}>
              <option value="boolean">Yes / no</option>
              <option value="quantitative">Amount</option>
            </select>
          </label>
        )}
        {draft.kind === 'quantitative' && (
          <>
            <label className="field">
              <span>Daily target</span>
              <input type="number" min="1" value={draft.target} onChange={(e) => set({ target: Number(e.target.value) })} />
            </label>
            {draft.custom && (
              <label className="field">
                <span>Unit</span>
                <input value={draft.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="ml, pages, min" />
              </label>
            )}
          </>
        )}
        <p>Schedule: {describe(draft.schedule)}</p>
        <label className="field">
          <span>Started on</span>
          <input type="date" value={draft.startDate} min={addDays(today, -RETRO_DAYS)} max={today} onChange={(e) => set({ startDate: e.target.value })} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" onClick={() => { setDraft(null); setError(null); }}>
            Back
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="datebar">
        <strong>What do you want to build?</strong>
        <button onClick={onCancel}>Cancel</button>
      </div>
      <button className="template" onClick={() => setDraft(blankCustom(today))}>
        <span>Make your own</span>
        <small>Pick a name and a goal</small>
      </button>
      {[...templatesByCategory()].map(([category, templates]) => (
        <section key={category}>
          <h3>{category}</h3>
          {templates.map((t) => (
            <button key={t.id} className="template" onClick={() => setDraft(fromTemplate(t, today))}>
              <span>{t.name}</span>
              <small>
                {t.kind === 'quantitative' ? `${t.target} ${t.unit}` : 'Yes / no'} · {describe(t.schedule)}
              </small>
            </button>
          ))}
        </section>
      ))}
    </>
  );
}
