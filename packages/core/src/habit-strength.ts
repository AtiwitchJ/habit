import { addDays, type LogicalDate } from './logical-date.ts';
import { isDue, type HabitRule, type LogRow, type Schedule } from './streak.ts';

export type StrengthStatus = 'fragile' | 'building' | 'strong' | 'mastered';

export interface HabitStrengthSummary {
  /** Score from 0 to 100, formatted to 1 decimal place */
  score: number;
  /** Raw score between 0.0 and 1.0 */
  rawScore: number;
  /** Categorical habit strength status based on behavioral psychology */
  status: StrengthStatus;
  /** Thai display label for the status */
  statusLabelTh: string;
  /** English display label for the status */
  statusLabelEn: string;
  /** Trend comparing today with 7 days ago */
  trend: 'rising' | 'falling' | 'stable';
  /** Score difference compared to 7 days ago (-100 to +100) */
  delta7d: number;
  /** Projected score if user misses the next due day (demonstrating slip resilience) */
  projectedMissScore: number;
}

export interface HabitStrengthPoint {
  date: LogicalDate;
  score: number; // 0 to 100
  rawScore: number; // 0.0 to 1.0
  checkmarkValue: number; // 0.0 to 1.0
  isDue: boolean;
  isExcused: boolean;
}

/**
 * Calculates the target frequency $f$ (normalized per day) based on the habit's schedule.
 * Example:
 * - daily: 1.0
 * - 3 times a week: 3/7 ≈ 0.4286
 * - weekdays (Mon, Wed, Fri): 3/7 ≈ 0.4286
 */
export function calculateScheduleFrequency(schedule: Schedule): number {
  switch (schedule.type) {
    case 'daily':
      return 1.0;
    case 'weekdays':
      return Math.max(1, schedule.days.length) / 7.0;
    case 'times_per_week':
      return Math.max(1, Math.min(7, schedule.count)) / 7.0;
    case 'times_per_month':
      return Math.max(1, Math.min(31, schedule.count)) / 30.4375;
    case 'times_per_year':
      return Math.max(1, Math.min(366, schedule.count)) / 365.25;
    default:
      return 1.0;
  }
}

/**
 * Calculates the exponential decay multiplier based on Loop Habit Tracker's calibrated formula:
 * $\alpha = 0.5^{\frac{\sqrt{f}}{13.0}}$
 *
 * For a daily habit ($f = 1.0$):
 * $\alpha \approx 0.9481394$
 *
 * Reaches milestones for continuous daily adherence:
 * - 30 days: ~80%
 * - 60 days: ~96%
 * - 90 days: ~99%
 */
export function calculateDecayMultiplier(schedule: Schedule): number {
  const frequency = calculateScheduleFrequency(schedule);
  const exponent = Math.sqrt(frequency) / 13.0;
  return Math.pow(0.5, exponent);
}

/**
 * Categorizes the habit strength according to habit formation research (Lally et al., UCL).
 */
export function getStrengthStatus(score: number): {
  status: StrengthStatus;
  statusLabelTh: string;
  statusLabelEn: string;
} {
  if (score >= 90) {
    return {
      status: 'mastered',
      statusLabelTh: 'เข้าสู่สัญชาตญาณ (Mastered)',
      statusLabelEn: 'Automatic / Mastered',
    };
  }
  if (score >= 70) {
    return {
      status: 'strong',
      statusLabelTh: 'มั่นคงแข็งแรง (Strong)',
      statusLabelEn: 'Established / Strong',
    };
  }
  if (score >= 40) {
    return {
      status: 'building',
      statusLabelTh: 'กำลังพัฒนา (Developing)',
      statusLabelEn: 'Developing / Building',
    };
  }
  return {
    status: 'fragile',
    statusLabelTh: 'เปราะบาง เริ่มต้น (Fragile)',
    statusLabelEn: 'Early / Fragile',
  };
}

/**
 * Evaluates the checkmark value on a single logical day.
 * Returns:
 * - value: 0.0 (missed) to 1.0 (completed)
 * - isExcused: true if skipped or frozen
 * - isDueDay: whether the habit was scheduled on this day
 */
function evaluateDayValue(
  rule: HabitRule,
  daySum: number,
  isExcused: boolean,
  isRelapsed: boolean,
  isDueDay: boolean,
): { value: number; isExcused: boolean } {
  if (isExcused) {
    return { value: 0, isExcused: true };
  }

  if (rule.quit) {
    // For quit habits, any clean day is 1.0. A relapse is 0.0.
    return { value: isRelapsed ? 0 : 1.0, isExcused: false };
  }

  if (!isDueDay) {
    // Non-scheduled rest days are neutral and do not penalize the score
    return { value: 0, isExcused: true };
  }

  // Quantitative or boolean: fraction of target achieved (capped at 1.0)
  const ratio = Math.max(0, Math.min(1.0, daySum / rule.target));
  return { value: ratio, isExcused: false };
}

/**
 * Computes day-by-day habit strength timeline from rule.startDate to today.
 * Pure and deterministic.
 */
export function computeHabitStrengthSeries(
  rule: HabitRule,
  logs: LogRow[],
  today: LogicalDate,
): HabitStrengthPoint[] {
  if (!(rule.target > 0)) throw new RangeError('target must be > 0');

  // Aggregate logs by date
  const dayAggregates = new Map<LogicalDate, { sum: number; excused: boolean; relapsed: boolean }>();
  for (const log of logs) {
    if (log.deletedAt || log.logicalDate > today) continue;
    const agg = dayAggregates.get(log.logicalDate) ?? { sum: 0, excused: false, relapsed: false };
    if (log.kind === 'complete') {
      agg.sum += log.value;
    } else if (log.kind === 'relapse') {
      agg.relapsed = true;
    } else if (log.kind === 'skip' || log.kind === 'freeze') {
      agg.excused = true;
    }
    dayAggregates.set(log.logicalDate, agg);
  }

  const alpha = calculateDecayMultiplier(rule.schedule);
  const oneMinusAlpha = 1.0 - alpha;

  const series: HabitStrengthPoint[] = [];
  let currentScore = 0.0;

  for (let date = rule.startDate; date <= today; date = addDays(date, 1)) {
    const agg = dayAggregates.get(date);
    const daySum = agg?.sum ?? 0;
    const isExcused = agg?.excused ?? false;
    const isRelapsed = agg?.relapsed ?? false;
    const due = isDue(rule.schedule, date);

    const evaluated = evaluateDayValue(rule, daySum, isExcused, isRelapsed, due);

    if (evaluated.isExcused) {
      // Excused / Rest day: carry forward current score with zero penalty
      series.push({
        date,
        score: Math.round(currentScore * 1000) / 10,
        rawScore: currentScore,
        checkmarkValue: currentScore,
        isDue: due,
        isExcused: true,
      });
    } else {
      // Due day with checkmark value:
      // score_t = score_{t-1} * alpha + checkmarkValue * (1 - alpha)
      currentScore = currentScore * alpha + evaluated.value * oneMinusAlpha;
      series.push({
        date,
        score: Math.round(currentScore * 1000) / 10,
        rawScore: currentScore,
        checkmarkValue: evaluated.value,
        isDue: due,
        isExcused: false,
      });
    }
  }

  return series;
}

/**
 * Computes high-level summary stats of habit strength for a habit up to `today`.
 */
export function computeHabitStrength(
  rule: HabitRule,
  logs: LogRow[],
  today: LogicalDate,
): HabitStrengthSummary {
  const series = computeHabitStrengthSeries(rule, logs, today);
  if (series.length === 0) {
    const statusMeta = getStrengthStatus(0);
    return {
      score: 0,
      rawScore: 0,
      status: statusMeta.status,
      statusLabelTh: statusMeta.statusLabelTh,
      statusLabelEn: statusMeta.statusLabelEn,
      trend: 'stable',
      delta7d: 0,
      projectedMissScore: 0,
    };
  }

  const latest = series[series.length - 1];
  const rawScore = latest.rawScore;
  const score = Math.round(rawScore * 1000) / 10;

  // Compare with 7 days ago
  const idx7d = Math.max(0, series.length - 8);
  const score7dAgo = series[idx7d].score;
  const delta7d = Math.round((score - score7dAgo) * 10) / 10;

  let trend: 'rising' | 'falling' | 'stable' = 'stable';
  if (delta7d > 0.5) trend = 'rising';
  else if (delta7d < -0.5) trend = 'falling';

  // Projected score if next due day is missed (V = 0)
  const alpha = calculateDecayMultiplier(rule.schedule);
  const projectedMissRaw = rawScore * alpha;
  const projectedMissScore = Math.round(projectedMissRaw * 1000) / 10;

  const statusMeta = getStrengthStatus(score);

  return {
    score,
    rawScore,
    status: statusMeta.status,
    statusLabelTh: statusMeta.statusLabelTh,
    statusLabelEn: statusMeta.statusLabelEn,
    trend,
    delta7d,
    projectedMissScore,
  };
}
