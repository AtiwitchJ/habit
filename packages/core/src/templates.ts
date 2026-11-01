// Built-in habit catalog. Original list of generic activities (no third-party content copied).
// Stable `id` slugs let a user's habit remember which template it came from.

import type { Hue } from './repo.ts';
import type { Schedule } from './streak.ts';

export type TemplateCategory =
  | 'health' | 'fitness' | 'mind' | 'learning' | 'productivity' | 'home' | 'social' | 'finance'
  | 'creative' | 'outdoors' | 'relationships' | 'career' | 'eco';

// Default color for habits created from a template; the picker can override it.
export const CATEGORY_HUE: Record<TemplateCategory, Hue> = {
  health: 'red', fitness: 'orange', mind: 'purple', learning: 'blue', productivity: 'yellow', home: 'teal', social: 'pink',
  finance: 'green', creative: 'pink', outdoors: 'green', relationships: 'red', career: 'blue', eco: 'teal',
};

export interface HabitTemplate {
  id: string;
  icon: string; // one emoji
  name: string;
  category: TemplateCategory;
  kind: 'boolean' | 'quantitative';
  target: number; // boolean = 1
  unit?: string; // required when quantitative
  schedule: Schedule;
  reminderTime?: string; // 'HH:MM' suggestion
  alts?: UnitOption[]; // other ways to measure the same activity
}

export interface UnitOption {
  target: number;
  unit: string;
}

const daily: Schedule = { type: 'daily' };
const perWeek = (count: number): Schedule => ({ type: 'times_per_week', count });
const weekdays = (days: number[]): Schedule => ({ type: 'weekdays', days });

const bool = (id: string, icon: string, name: string, category: TemplateCategory, schedule: Schedule = daily, reminderTime?: string): HabitTemplate =>
  ({ id, icon, name, category, kind: 'boolean', target: 1, schedule, reminderTime });

const qty = (id: string, icon: string, name: string, category: TemplateCategory, target: number, unit: string, schedule: Schedule = daily, reminderTime?: string): HabitTemplate =>
  ({ id, icon, name, category, kind: 'quantitative', target, unit, schedule, reminderTime });

const BASE_TEMPLATES: HabitTemplate[] = [
  // health
  qty('drink-water', '💧', 'Drink water', 'health', 2000, 'ml'),
  bool('sleep-on-time', '🌙', 'Go to bed on time', 'health', daily, '22:30'),
  qty('sleep-hours', '😴', 'Sleep 7+ hours', 'health', 7, 'h'),
  bool('take-vitamins', '💊', 'Take vitamins', 'health', daily, '08:00'),
  bool('no-sugar', '🍬', 'No added sugar', 'health'),
  bool('eat-vegetables', '🥦', 'Eat vegetables', 'health'),
  bool('floss', '🦷', 'Floss teeth', 'health', daily, '21:30'),
  bool('no-alcohol', '🚫', 'No alcohol', 'health'),
  qty('eat-fruit', '🍎', 'Eat fruit', 'health', 2, 'servings'),
  bool('sunscreen', '🧴', 'Apply sunscreen', 'health', daily, '08:00'),
  bool('wash-face', '🧼', 'Wash face before bed', 'health', daily, '21:45'),
  bool('no-sugary-drinks', '🥤', 'No sugary drinks', 'health'),
  qty('limit-caffeine', '☕', 'Limit coffee to 2 cups', 'health', 2, 'cups'),
  bool('posture-check', '🧍', 'Posture check-in', 'health', weekdays([1, 2, 3, 4, 5])),
  // fitness
  qty('steps', '👟', 'Walk 8,000 steps', 'fitness', 8000, 'steps'),
  bool('workout', '🏋️', 'Workout', 'fitness', perWeek(3)),
  qty('run', '🏃', 'Run', 'fitness', 5, 'km', perWeek(2)),
  bool('stretch', '🤸', 'Stretch', 'fitness', daily, '07:00'),
  bool('yoga', '🧘', 'Yoga', 'fitness', perWeek(3)),
  qty('pushups', '💪', 'Push-ups', 'fitness', 30, 'reps', weekdays([1, 3, 5])),
  qty('swim', '🏊', 'Swim', 'fitness', 20, 'laps', perWeek(2)),
  qty('plank', '⏱️', 'Hold a plank', 'fitness', 60, 'sec'),
  qty('cycle', '🚴', 'Cycle', 'fitness', 15, 'km', perWeek(3)),
  qty('squats', '🦵', 'Squats', 'fitness', 50, 'reps', weekdays([2, 4, 6])),
  bool('hiit', '🔥', 'HIIT session', 'fitness', perWeek(2)),
  qty('take-stairs', '🪜', 'Take the stairs', 'fitness', 10, 'floors', weekdays([1, 2, 3, 4, 5])),
  qty('jump-rope', '🪢', 'Jump rope', 'fitness', 5, 'min', perWeek(4)),
  // mind
  qty('meditate', '🕉️', 'Meditate', 'mind', 10, 'min', daily, '07:30'),
  bool('journal', '📓', 'Write in journal', 'mind', daily, '21:00'),
  bool('gratitude', '🙏', 'Write 3 gratitudes', 'mind', daily, '21:00'),
  bool('no-phone-bed', '📵', 'No phone in bed', 'mind', daily, '22:00'),
  qty('screen-time', '🌿', 'Offline time', 'mind', 60, 'min'),
  bool('no-doomscroll', '🧠', 'No doomscrolling', 'mind'),
  qty('breathing', '🌬️', 'Deep breathing', 'mind', 5, 'min', daily, '12:30'),
  bool('digital-sabbath', '🔌', 'Digital-free evening', 'mind', weekdays([7]), '18:00'),
  bool('morning-pages', '✍️', 'Morning pages', 'mind', daily, '07:00'),
  qty('mood-check', '🙂', 'Rate my mood (1-5)', 'mind', 1, 'check-in', daily, '20:30'),
  bool('affirmation', '💬', 'Say a positive affirmation', 'mind', daily, '07:15'),
  // learning
  qty('read', '📚', 'Read', 'learning', 20, 'pages'),
  qty('language', '🗣️', 'Practice a language', 'learning', 15, 'min'),
  qty('study', '🎓', 'Study session', 'learning', 45, 'min', weekdays([1, 2, 3, 4, 5])),
  qty('practice-instrument', '🎸', 'Practice instrument', 'learning', 20, 'min', perWeek(4)),
  bool('podcast', '🎧', 'Listen to a learning podcast', 'learning', perWeek(3)),
  qty('flashcards', '🃏', 'Review flashcards', 'learning', 20, 'cards'),
  qty('online-course', '💻', 'Online course lesson', 'learning', 1, 'lessons', weekdays([1, 3, 5])),
  qty('coding-practice', '⌨️', 'Coding practice', 'learning', 30, 'min', weekdays([1, 2, 3, 4, 5]), '19:00'),
  bool('learn-word', '🔤', 'Learn a new word', 'learning', daily, '08:00'),
  qty('watch-documentary', '🎬', 'Watch a documentary', 'learning', 1, 'films', perWeek(1)),
  // productivity
  bool('plan-day', '🗓️', 'Plan the day', 'productivity', weekdays([1, 2, 3, 4, 5]), '08:30'),
  bool('inbox-zero', '📥', 'Clear inbox', 'productivity', weekdays([1, 2, 3, 4, 5]), '17:00'),
  qty('deep-work', '🎯', 'Deep work', 'productivity', 90, 'min', weekdays([1, 2, 3, 4, 5])),
  bool('weekly-review', '📋', 'Weekly review', 'productivity', weekdays([7]), '18:00'),
  bool('top-three', '🥇', 'Pick top 3 priorities', 'productivity', weekdays([1, 2, 3, 4, 5]), '08:45'),
  qty('pomodoro', '🍅', 'Pomodoro sessions', 'productivity', 4, 'sessions', weekdays([1, 2, 3, 4, 5])),
  bool('shutdown-ritual', '🔕', 'Shutdown ritual', 'productivity', weekdays([1, 2, 3, 4, 5]), '17:30'),
  bool('desk-tidy', '🗄️', 'Tidy the desk', 'productivity', weekdays([1, 2, 3, 4, 5]), '17:15'),
  bool('eat-the-frog', '🐸', 'Do the hardest task first', 'productivity', weekdays([1, 2, 3, 4, 5]), '09:00'),
  // home
  bool('make-bed', '🛏️', 'Make the bed', 'home', daily, '07:30'),
  bool('tidy-up', '🧹', 'Tidy up 10 minutes', 'home'),
  bool('laundry', '🧺', 'Do laundry', 'home', perWeek(2)),
  bool('water-plants', '🪴', 'Water plants', 'home', weekdays([2, 5])),
  bool('dishes', '🍽️', 'Wash the dishes', 'home', daily, '20:00'),
  bool('vacuum', '🧽', 'Vacuum or sweep', 'home', weekdays([3, 6])),
  bool('meal-prep', '🥡', 'Meal prep', 'home', weekdays([7]), '16:00'),
  bool('declutter', '📦', 'Declutter one item', 'home'),
  bool('clean-bathroom', '🚿', 'Clean the bathroom', 'home', perWeek(1)),
  bool('take-out-trash', '🗑️', 'Take out the trash', 'home', weekdays([2, 5]), '19:00'),
  // social
  bool('call-family', '📞', 'Call family or a friend', 'social', perWeek(2)),
  bool('compliment', '😊', 'Give someone a compliment', 'social'),
  bool('message-friend', '💌', 'Message an old friend', 'social', perWeek(2)),
  bool('say-thanks', '🤝', 'Thank someone', 'social'),
  bool('meet-friends', '🍻', 'Meet friends in person', 'social', perWeek(1)),
  bool('small-talk', '👋', 'Chat with a stranger', 'social', perWeek(3)),
  bool('host-dinner', '🍲', 'Host a dinner', 'social', weekdays([6])),
  // finance
  bool('log-expenses', '🧾', 'Log expenses', 'finance', daily, '20:00'),
  bool('no-impulse-buy', '🛑', 'No impulse buying', 'finance'),
  bool('review-budget', '📊', 'Review budget', 'finance', weekdays([7]), '18:30'),
  qty('save-money', '🐷', 'Save money', 'finance', 100, 'THB'),
  bool('cook-at-home', '🍳', 'Cook instead of ordering', 'finance', weekdays([1, 2, 3, 4, 5])),
  bool('check-investments', '📈', 'Check investments', 'finance', weekdays([7])),
  bool('pay-bills', '💳', 'Pay bills on time', 'finance', weekdays([1])),
  bool('no-spend-day', '🪙', 'No-spend day', 'finance', perWeek(2)),
  bool('read-finance', '📰', 'Read about personal finance', 'finance', perWeek(3)),
  // creative
  qty('draw', '🎨', 'Draw or sketch', 'creative', 15, 'min', perWeek(4)),
  qty('write-words', '🖊️', 'Write words', 'creative', 500, 'words', daily, '09:00'),
  bool('take-photo', '📷', 'Take a photo worth keeping', 'creative'),
  qty('play-music', '🎹', 'Play music for fun', 'creative', 20, 'min', perWeek(4), '19:30'),
  bool('cook-new', '👩‍🍳', 'Cook something new', 'creative', weekdays([6])),
  qty('craft', '🧵', 'Craft or build something', 'creative', 30, 'min', perWeek(2)),
  bool('share-work', '📤', 'Share something I made', 'creative', weekdays([7])),
  qty('sing', '🎤', 'Sing', 'creative', 10, 'min', perWeek(3)),
  // outdoors
  qty('sunlight', '🌅', 'Get morning sunlight', 'outdoors', 15, 'min', daily, '07:45'),
  qty('walk-outside', '🚶', 'Walk outside', 'outdoors', 30, 'min'),
  bool('hike', '🥾', 'Go for a hike', 'outdoors', weekdays([6, 7])),
  bool('stargaze', '🔭', 'Look at the night sky', 'outdoors', perWeek(1), '20:30'),
  bool('park-visit', '🌳', 'Visit a park', 'outdoors', perWeek(2)),
  bool('garden', '🌱', 'Garden', 'outdoors', weekdays([3, 7])),
  bool('picnic', '🥪', 'Eat lunch outside', 'outdoors', weekdays([1, 2, 3, 4, 5]), '12:15'),
  bool('birdwatch', '🐦', 'Spot a bird', 'outdoors', perWeek(3)),
  // relationships
  bool('compliment-partner', '💖', 'Compliment my partner', 'relationships'),
  qty('family-time', '👨‍👩‍👧', 'Quality time with family', 'relationships', 30, 'min'),
  bool('date-night', '🕯️', 'Date night', 'relationships', weekdays([5]), '19:00'),
  bool('hug', '🤗', 'Hug someone I love', 'relationships'),
  bool('write-note', '💝', 'Write a kind note', 'relationships', perWeek(1)),
  bool('listen-fully', '👂', 'Listen without phone', 'relationships'),
  bool('check-in-parents', '🏡', 'Check in on parents', 'relationships', perWeek(2), '18:00'),
  bool('bedtime-story', '🧸', 'Read to the kids', 'relationships', daily, '20:00'),
  // career
  qty('upskill', '🛠️', 'Practice a work skill', 'career', 30, 'min', weekdays([1, 2, 3, 4, 5])),
  bool('update-portfolio', '💼', 'Update portfolio or resume', 'career', weekdays([7])),
  bool('network', '🔗', 'Reach out to a contact', 'career', perWeek(2)),
  bool('review-goals', '🧭', 'Review career goals', 'career', weekdays([1]), '09:00'),
  bool('industry-news', '🗞️', 'Read industry news', 'career', weekdays([1, 2, 3, 4, 5]), '08:15'),
  bool('ask-feedback', '🗣', 'Ask for feedback', 'career', perWeek(1)),
  qty('apply-jobs', '📨', 'Send applications', 'career', 3, 'apps', weekdays([1, 2, 3, 4, 5])),
  bool('mentor', '🧑‍🏫', 'Mentor or help a colleague', 'career', perWeek(1)),
  // eco
  bool('sort-waste', '♻️', 'Sort recycling', 'eco'),
  bool('reusable-bag', '🛍️', 'Bring a reusable bag', 'eco'),
  bool('lights-off', '💡', 'Switch off unused lights', 'eco', daily, '22:00'),
  bool('public-transit', '🚌', 'Use public transport or walk', 'eco', weekdays([1, 2, 3, 4, 5])),
  bool('refill-bottle', '🫗', 'Use a refillable bottle', 'eco'),
  bool('meatless-meal', '🥗', 'Meatless meal', 'eco', perWeek(3)),
  qty('short-shower', '🚿', 'Short shower', 'eco', 5, 'min', daily, '07:15'),
  bool('compost', '🍂', 'Compost food scraps', 'eco', perWeek(4)),
];

const o = (target: number, unit: string): UnitOption => ({ target, unit });

// Count-style options ("glasses", "times") pair with a one-per-tap step in the UI.
const UNIT_ALTS: Record<string, UnitOption[]> = {
  'drink-water': [o(8, 'glasses'), o(4, 'bottles')],
  'sleep-hours': [o(420, 'min')],
  'eat-fruit': [o(300, 'g')],
  'limit-caffeine': [o(200, 'mg')],
  steps: [o(30, 'min'), o(5, 'km')],
  run: [o(30, 'min'), o(1, 'times')],
  pushups: [o(3, 'sets'), o(5, 'min')],
  swim: [o(500, 'm'), o(30, 'min')],
  plank: [o(3, 'times')],
  cycle: [o(45, 'min')],
  squats: [o(3, 'sets')],
  'take-stairs': [o(3, 'times')],
  'jump-rope': [o(300, 'skips')],
  meditate: [o(1, 'times'), o(2, 'sessions')],
  'screen-time': [o(1, 'h')],
  breathing: [o(10, 'breaths'), o(3, 'times')],
  read: [o(30, 'min'), o(1, 'chapters')],
  language: [o(1, 'lessons'), o(10, 'words')],
  study: [o(2, 'pomodoros'), o(1, 'h')],
  'practice-instrument': [o(3, 'songs')],
  flashcards: [o(10, 'min')],
  'coding-practice': [o(1, 'problems')],
  'deep-work': [o(2, 'blocks'), o(3, 'pomodoros')],
  pomodoro: [o(100, 'min')],
  'save-money': [o(1, 'times')],
  draw: [o(1, 'sketches')],
  'write-words': [o(2, 'pages'), o(30, 'min')],
  'play-music': [o(3, 'songs')],
  sunlight: [o(1, 'times')],
  'walk-outside': [o(3, 'km'), o(4000, 'steps')],
  'family-time': [o(1, 'activities')],
  upskill: [o(1, 'lessons')],
  'short-shower': [o(1, 'times')],
};

export const HABIT_TEMPLATES: readonly HabitTemplate[] = BASE_TEMPLATES.map((t) => (UNIT_ALTS[t.id] ? { ...t, alts: UNIT_ALTS[t.id] } : t));

export function templatesByCategory(): Map<TemplateCategory, HabitTemplate[]> {
  const grouped = new Map<TemplateCategory, HabitTemplate[]>();
  for (const template of HABIT_TEMPLATES) {
    grouped.set(template.category, [...(grouped.get(template.category) ?? []), template]);
  }
  return grouped;
}
