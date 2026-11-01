import { toLogicalDate, type DayBoundary } from '@habit/core/logical-date';
import { shouldRemind } from '@habit/core/reminder';
import { repo, storage } from './repo-local.ts';

export function startReminders(boundary: DayBoundary): () => void {
  let stopped = false;
  let checking = false;
  const sent = new Set<string>();
  const check = async () => {
    if (checking || stopped || !('Notification' in window) || Notification.permission !== 'granted') return;
    checking = true;
    try {
      const now = new Date();
      const date = toLogicalDate(now, boundary);
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const habit of await repo.listHabits()) {
        if (stopped) break;
        if (!(habit.reminderTimes ?? [habit.reminderTime]).includes(time)) continue;
        const key = `habit:reminder:${habit.id}`;
        const occurrence = `${date}:${time}`;
        if (sent.has(`${key}:${occurrence}`) || storage?.getItem(key) === occurrence) continue;
        const logs = await repo.listLogs(habit.id);
        if (stopped || !shouldRemind(habit, logs, date, time)) continue;
        try {
          new Notification('Habit reminder', { body: `${habit.icon ?? '🌱'} ${habit.name}`, tag: `${key}:${occurrence}` });
          sent.add(`${key}:${occurrence}`);
          try { storage?.setItem(key, occurrence); } catch { /* session deduplication still applies */ }
        } catch { /* notifications are unsupported on some mobile browsers */ }
      }
    } catch (error) {
      console.error('Unable to check reminders', error);
    } finally {
      checking = false;
    }
  };
  void check();
  // shortcut: timers may be throttled or stopped when the app is closed; use push for background delivery.
  const timer = window.setInterval(() => void check(), 20_000);
  return () => { stopped = true; window.clearInterval(timer); };
}
