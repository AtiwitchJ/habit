// Built-in habit catalog. Original list of generic activities (no third-party content copied).
// Stable `id` slugs let a user's habit remember which template it came from.

import type { Schedule } from './streak.ts';

export type TemplateCategory = 'health' | 'fitness' | 'mind' | 'learning' | 'productivity' | 'home' | 'social' | 'finance';

export interface HabitTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  kind: 'boolean' | 'quantitative';
  target: number; // boolean = 1
  unit?: string; // required when quantitative
  schedule: Schedule;
  reminderTime?: string; // 'HH:MM' suggestion
}

const daily: Schedule = { type: 'daily' };
const perWeek = (count: number): Schedule => ({ type: 'times_per_week', count });
const weekdays = (days: number[]): Schedule => ({ type: 'weekdays', days });

const bool = (id: string, name: string, category: TemplateCategory, schedule: Schedule = daily, reminderTime?: string): HabitTemplate =>
  ({ id, name, category, kind: 'boolean', target: 1, schedule, reminderTime });

const qty = (id: string, name: string, category: TemplateCategory, target: number, unit: string, schedule: Schedule = daily, reminderTime?: string): HabitTemplate =>
  ({ id, name, category, kind: 'quantitative', target, unit, schedule, reminderTime });

export const HABIT_TEMPLATES: readonly HabitTemplate[] = [
  // health
  qty('drink-water', 'Drink water', 'health', 2000, 'ml'),
  bool('sleep-on-time', 'Go to bed on time', 'health', daily, '22:30'),
  qty('sleep-hours', 'Sleep 7+ hours', 'health', 7, 'h'),
  bool('take-vitamins', 'Take vitamins', 'health', daily, '08:00'),
  bool('no-sugar', 'No added sugar', 'health'),
  bool('eat-vegetables', 'Eat vegetables', 'health'),
  bool('floss', 'Floss teeth', 'health', daily, '21:30'),
  bool('no-alcohol', 'No alcohol', 'health'),
  // fitness
  qty('steps', 'Walk 8,000 steps', 'fitness', 8000, 'steps'),
  bool('workout', 'Workout', 'fitness', perWeek(3)),
  qty('run', 'Run', 'fitness', 5, 'km', perWeek(2)),
  bool('stretch', 'Stretch', 'fitness', daily, '07:00'),
  bool('yoga', 'Yoga', 'fitness', perWeek(3)),
  qty('pushups', 'Push-ups', 'fitness', 30, 'reps', weekdays([1, 3, 5])),
  // mind
  qty('meditate', 'Meditate', 'mind', 10, 'min', daily, '07:30'),
  bool('journal', 'Write in journal', 'mind', daily, '21:00'),
  bool('gratitude', 'Write 3 gratitudes', 'mind', daily, '21:00'),
  bool('no-phone-bed', 'No phone in bed', 'mind', daily, '22:00'),
  qty('screen-time', 'Offline time', 'mind', 60, 'min'),
  // learning
  qty('read', 'Read', 'learning', 20, 'pages'),
  qty('language', 'Practice a language', 'learning', 15, 'min'),
  qty('study', 'Study session', 'learning', 45, 'min', weekdays([1, 2, 3, 4, 5])),
  qty('practice-instrument', 'Practice instrument', 'learning', 20, 'min', perWeek(4)),
  bool('podcast', 'Listen to a learning podcast', 'learning', perWeek(3)),
  // productivity
  bool('plan-day', 'Plan the day', 'productivity', weekdays([1, 2, 3, 4, 5]), '08:30'),
  bool('inbox-zero', 'Clear inbox', 'productivity', weekdays([1, 2, 3, 4, 5]), '17:00'),
  qty('deep-work', 'Deep work', 'productivity', 90, 'min', weekdays([1, 2, 3, 4, 5])),
  bool('weekly-review', 'Weekly review', 'productivity', weekdays([7]), '18:00'),
  // home
  bool('make-bed', 'Make the bed', 'home', daily, '07:30'),
  bool('tidy-up', 'Tidy up 10 minutes', 'home'),
  bool('laundry', 'Do laundry', 'home', perWeek(2)),
  bool('water-plants', 'Water plants', 'home', weekdays([2, 5])),
  // social
  bool('call-family', 'Call family or a friend', 'social', perWeek(2)),
  bool('compliment', 'Give someone a compliment', 'social'),
  // finance
  bool('log-expenses', 'Log expenses', 'finance', daily, '20:00'),
  bool('no-impulse-buy', 'No impulse buying', 'finance'),
  bool('review-budget', 'Review budget', 'finance', weekdays([7]), '18:30'),
];

export function templatesByCategory(): Map<TemplateCategory, HabitTemplate[]> {
  const grouped = new Map<TemplateCategory, HabitTemplate[]>();
  for (const template of HABIT_TEMPLATES) {
    grouped.set(template.category, [...(grouped.get(template.category) ?? []), template]);
  }
  return grouped;
}
