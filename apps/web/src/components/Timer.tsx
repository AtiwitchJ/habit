import { useEffect, useRef, useState } from 'react';
import { elapsedSeconds, parseTimer, remainingSeconds, timerMinutes, type TimerState } from '@habit/core/timer';
import { storage } from '../repo-local.ts';

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

// Stopwatch or countdown for minute-based habits. Persisted by start time, so a reload keeps it running.
export function Timer({ habitId, disabled, onFinish }: { habitId: string; disabled: boolean; onFinish(minutes: number): void }) {
  const key = `habit:timer:${habitId}`;
  const read = () => { try { return parseTimer(storage?.getItem(key) ?? null); } catch { return null; } };
  const [timer, setTimer] = useState<TimerState | null>(read);
  const [minutes, setMinutes] = useState(25);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState('');
  const finishing = useRef(false);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const save = (next: TimerState | null) => {
    try { if (next) storage?.setItem(key, JSON.stringify(next)); else storage?.removeItem(key); } catch { /* runs from memory only */ }
    setTimer(next);
    setNow(Date.now());
  };

  const stop = () => {
    if (!timer || finishing.current) return;
    finishing.current = true; // one tap, one log
    const logged = timerMinutes(timer, Date.now());
    save(null);
    if (logged > 0) { setMessage(`Logged ${logged} min.`); onFinish(logged); } else setMessage('Too short to log.');
    finishing.current = false;
  };

  if (!timer) {
    return (
      <div className="timer">
        <div className="chips">
          <button type="button" disabled={disabled} onClick={() => { setMessage(''); save({ mode: 'stopwatch', startedAt: Date.now() }); }}>▶ Stopwatch</button>
          <button type="button" disabled={disabled || !(minutes > 0)} onClick={() => { setMessage(''); save({ mode: 'countdown', startedAt: Date.now(), seconds: Math.round(minutes * 60) }); }}>⏳ Countdown</button>
          <input type="number" min="1" max="600" aria-label="Countdown minutes" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </div>
        {message && <p role="status">{message}</p>}
      </div>
    );
  }
  const up = timer.mode === 'countdown' && remainingSeconds(timer, now) === 0;
  return (
    <div className="timer">
      <strong aria-live="off">{timer.mode === 'countdown' ? clock(remainingSeconds(timer, now)) : clock(elapsedSeconds(timer, now))}</strong>
      {up && <span> Time&apos;s up!</span>}
      <div className="chips">
        <button type="button" className="primary" onClick={stop}>■ Stop &amp; log</button>
        <button type="button" onClick={() => save(null)}>Discard</button>
      </div>
    </div>
  );
}
