import { useEffect, useMemo, useState } from 'react';
import { currentLogicalDate, safeBoundary } from '@habit/core/logical-date';
import { persistent, storage } from './repo-local.ts';
import { AddHabit } from './screens/AddHabit.tsx';
import { Today } from './screens/Today.tsx';
import { browserTimeZone, loadRolloverMinutes, saveRolloverMinutes } from './settings.ts';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning! Small steps add up.';
  if (hour < 18) return 'Good afternoon! How is it going?';
  return 'Good evening! Still time for a habit.';
}

export function App() {
  const [screen, setScreen] = useState<'today' | 'add'>('today');
  const [rolloverMinutes, setRolloverMinutes] = useState(() => loadRolloverMinutes(storage));
  const [, tick] = useState(0);

  // Re-evaluate the logical date every minute so the day flips while the app stays open.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { boundary, warning } = useMemo(() => safeBoundary(browserTimeZone(), rolloverMinutes), [rolloverMinutes]);
  const today = currentLogicalDate(boundary);

  return (
    <main>
      <div className="topbar">
        <h1>Habits</h1>
        <label>
          Day starts at
          <select
            value={String(rolloverMinutes / 60)}
            onChange={(e) => {
              const minutes = Number(e.target.value) * 60;
              setRolloverMinutes(minutes);
              saveRolloverMinutes(storage, minutes);
            }}
          >
            {Array.from({ length: 9 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="greeting">{greeting(new Date().getHours())}</p>
      {!persistent && <p className="banner">Storage is unavailable. Your data will not persist after you close this tab.</p>}
      {warning && <p className="banner">{warning}</p>}
      {screen === 'today' ? (
        <Today today={today} onAdd={() => setScreen('add')} />
      ) : (
        <AddHabit today={today} onDone={() => setScreen('today')} onCancel={() => setScreen('today')} />
      )}
    </main>
  );
}
