// Stopwatch / countdown for minute-based habits. State is a start timestamp, so it survives reloads,
// tab throttling and closed apps: elapsed time is always derived from the clock, never counted by ticks.

export type TimerState =
  | { mode: 'stopwatch'; startedAt: number } // epoch ms
  | { mode: 'countdown'; startedAt: number; seconds: number };

export function isTimeUnit(unit: string | undefined): boolean {
  return /^(min|mins|minute|minutes|นาที)$/i.test(unit?.trim() ?? '');
}

export function elapsedSeconds(timer: TimerState, nowMs: number): number {
  const seconds = Math.max(0, Math.floor((nowMs - timer.startedAt) / 1000));
  return timer.mode === 'countdown' ? Math.min(seconds, timer.seconds) : seconds;
}

export function remainingSeconds(timer: Extract<TimerState, { mode: 'countdown' }>, nowMs: number): number {
  return timer.seconds - elapsedSeconds(timer, nowMs);
}

// Whole minutes to log when the timer stops. Under 30 seconds is not worth a log.
export function timerMinutes(timer: TimerState, nowMs: number): number {
  return Math.round(elapsedSeconds(timer, nowMs) / 60);
}

// Reads a timer saved by the web app. Anything malformed is dropped.
export function parseTimer(raw: string | null): TimerState | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || !Number.isFinite(value.startedAt)) return null;
    if (value.mode === 'stopwatch') return { mode: 'stopwatch', startedAt: value.startedAt };
    if (value.mode === 'countdown' && value.seconds > 0 && Number.isFinite(value.seconds)) {
      return { mode: 'countdown', startedAt: value.startedAt, seconds: value.seconds };
    }
  } catch {
    // fall through
  }
  return null;
}
