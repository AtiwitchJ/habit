import type { StorageLike } from '@habit/core/repo';

const KEY = 'habit:rollover-minutes';
export const DEFAULT_ROLLOVER_MINUTES = 240; // 04:00

export function loadRolloverMinutes(storage: StorageLike | null): number {
  try {
    const raw = storage?.getItem(KEY);
    if (raw != null && Number.isInteger(Number(raw))) return Number(raw);
  } catch {
    // fall through to default
  }
  return DEFAULT_ROLLOVER_MINUTES;
}

export function saveRolloverMinutes(storage: StorageLike | null, minutes: number): void {
  try {
    storage?.setItem(KEY, String(minutes));
  } catch {
    // setting lasts for this session only
  }
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
