import { useEffect, useMemo, useState } from 'react';
import { currentLogicalDate, safeBoundary } from '@habit/core/logical-date';
import { AccountBar } from './components/AccountBar.tsx';
import { claimDevice, isGuest, pb, setGuest } from './cloud.ts';
import { persistent, storage } from './repo-local.ts';
import { AddHabit } from './screens/AddHabit.tsx';
import { Login } from './screens/Login.tsx';
import { Today } from './screens/Today.tsx';
import { browserTimeZone, loadRolloverMinutes, saveRolloverMinutes } from './settings.ts';
import { startSync, type SyncStatus } from './sync-runner.ts';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning! Small steps add up.';
  if (hour < 18) return 'Good afternoon! How is it going?';
  return 'Good evening! Still time for a habit.';
}

export function App() {
  const [screen, setScreen] = useState<'today' | 'add'>('today');
  const [rolloverMinutes, setRolloverMinutes] = useState(() => loadRolloverMinutes(storage));
  const [user, setUser] = useState(() => (pb?.authStore.isValid ? pb.authStore.record : null));
  const [guest, setGuestState] = useState(isGuest);
  const [status, setStatus] = useState<SyncStatus>({ state: 'syncing' });
  const [, tick] = useState(0);

  // Re-evaluate the logical date every minute so the day flips while the app stays open.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pb) return;
    const client = pb;
    return client.authStore.onChange((_token, record) => setUser(client.authStore.isValid ? record : null));
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!pb || !userId) return;
    if (!claimDevice(userId)) return; // page is reloading with local data cleared
    return startSync(pb, userId, setStatus);
  }, [userId]);

  const { boundary, warning } = useMemo(() => safeBoundary(browserTimeZone(), rolloverMinutes), [rolloverMinutes]);
  const today = currentLogicalDate(boundary);
  const needsLogin = !user && !guest;

  const chooseGuest = (value: boolean) => {
    setGuest(value);
    setGuestState(value);
  };

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
      {pb && user && <AccountBar pb={pb} userId={user.id} email={String(user.email ?? '')} status={status} />}
      {pb && !user && guest && (
        <p className="account">
          Not signed in. Your habits are stored on this device only.
          <button onClick={() => chooseGuest(false)}>Sign in to sync</button>
        </p>
      )}
      {pb && needsLogin ? (
        <Login pb={pb} onAuthed={() => chooseGuest(false)} onSkip={() => chooseGuest(true)} />
      ) : screen === 'today' ? (
        <Today today={today} onAdd={() => setScreen('add')} />
      ) : (
        <AddHabit today={today} onDone={() => setScreen('today')} onCancel={() => setScreen('today')} />
      )}
    </main>
  );
}
