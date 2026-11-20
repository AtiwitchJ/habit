import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultPlayerProfile,
  calculateNextLevelXp,
  calculateXpGain,
  calculateGoldGain,
  checkLevelUp,
  applyXp,
  applyBossDamage,
  applyPlayerDamage,
  useStreakShield,
  awardStreakShield,
  calculateHabitDamageToBoss,
  DEFAULT_GAMIFICATION_CONFIG,
  type BossRecord,
} from '../src/gamification.ts';

test('createDefaultPlayerProfile creates initial player state with level 1 and 100 max HP', () => {
  const player = createDefaultPlayerProfile('player-1');
  assert.equal(player.id, 'player-1');
  assert.equal(player.level, 1);
  assert.equal(player.currentXp, 0);
  assert.equal(player.nextLevelXp, 100);
  assert.equal(player.maxHp, 100); // 50 base + 10 CON * 5
  assert.equal(player.hp, 100);
  assert.equal(player.gold, 0);
  assert.equal(player.streakShields, 0);
  assert.deepEqual(player.attributes, { str: 10, int: 10, con: 10, per: 10 });
});

test('createDefaultPlayerProfile accepts custom overrides', () => {
  const player = createDefaultPlayerProfile('p2', {
    level: 5,
    gold: 250,
    streakShields: 2,
    attributes: { str: 20, int: 15, con: 12, per: 18 },
  });
  assert.equal(player.level, 5);
  assert.equal(player.gold, 250);
  assert.equal(player.streakShields, 2);
  assert.equal(player.attributes.str, 20);
});

test('calculateNextLevelXp scales with level exponent curve', () => {
  assert.equal(calculateNextLevelXp(1), 100);
  assert.equal(calculateNextLevelXp(2), 282);
  assert.equal(calculateNextLevelXp(3), 519);
});

test('calculateXpGain respects habit difficulty and streak multiplier', () => {
  assert.equal(calculateXpGain('trivial', 1), 5);
  assert.equal(calculateXpGain('easy', 1), 10);
  assert.equal(calculateXpGain('medium', 1), 20);
  assert.equal(calculateXpGain('hard', 1), 40);

  // Streak bonus: 10 days = +45% (factor 1.45) -> 20 * 1.45 = 29
  const mediumStreak10 = calculateXpGain('medium', 10);
  assert.equal(mediumStreak10, 29);

  // Capped at 2.0x (30 days) -> 20 * 2.0 = 40
  const mediumStreak30 = calculateXpGain('medium', 30);
  assert.equal(mediumStreak30, 40);
});

test('calculateGoldGain applies base amount, streak, and perception bonus', () => {
  // Base easy = 3
  assert.equal(calculateGoldGain('easy', 1, 0), 3);

  // Perception bonus: PER 20 = +40%
  const goldWithPer = calculateGoldGain('easy', 1, 20);
  assert.equal(goldWithPer, 4); // 3 * 1.4 = 4.2 -> 4

  // Hard difficulty + streak + high perception
  const hardGold = calculateGoldGain('hard', 10, 25);
  assert.ok(hardGold > 15);
});

test('checkLevelUp checks threshold correctly', () => {
  const notReady = checkLevelUp(80, 1);
  assert.equal(notReady.canLevelUp, false);
  assert.equal(notReady.remainingXp, 80);

  const ready = checkLevelUp(120, 1);
  assert.equal(ready.canLevelUp, true);
  assert.equal(ready.remainingXp, 20);
});

test('applyXp updates player XP and handles single level up with full heal', () => {
  const player = createDefaultPlayerProfile('p1');
  player.hp = 30; // damaged player

  // Add 120 XP -> enough for level 1 (needs 100) -> reaches level 2 with 20 leftover XP
  const { updatedPlayer, levelUpResult } = applyXp(player, 120);

  assert.equal(levelUpResult.leveledUp, true);
  assert.equal(levelUpResult.previousLevel, 1);
  assert.equal(levelUpResult.newLevel, 2);
  assert.equal(levelUpResult.statPointsGained, 5);
  assert.equal(updatedPlayer.level, 2);
  assert.equal(updatedPlayer.currentXp, 20);
  assert.equal(updatedPlayer.nextLevelXp, 282);
  assert.equal(updatedPlayer.hp, updatedPlayer.maxHp); // fully healed!
  assert.equal(updatedPlayer.maxHp, 110); // 50 + 50 (con) + 10 (lvl 2) = 110
});

test('applyXp handles multi-level jumps gracefully', () => {
  const player = createDefaultPlayerProfile('p1');
  // Need 100 for lvl 2, 282 for lvl 3 = 382 total. Give 400 XP.
  const { updatedPlayer, levelUpResult } = applyXp(player, 400);

  assert.equal(levelUpResult.leveledUp, true);
  assert.equal(levelUpResult.newLevel, 3);
  assert.equal(levelUpResult.levelsGained, 2);
  assert.equal(levelUpResult.statPointsGained, 10);
  assert.equal(updatedPlayer.currentXp, 18); // 400 - 100 - 282 = 18
});

test('calculateHabitDamageToBoss scales with habit difficulty and strength', () => {
  const dmgEasy = calculateHabitDamageToBoss('easy', 1, 10);
  const dmgHard = calculateHabitDamageToBoss('hard', 1, 10);
  assert.ok(dmgHard > dmgEasy);

  const dmgWithStr = calculateHabitDamageToBoss('hard', 1, 30);
  assert.ok(dmgWithStr > dmgHard);
});

test('applyBossDamage reduces boss HP and marks defeated with rewards', () => {
  const boss: BossRecord = {
    id: 'boss-1',
    name: 'Procrastination Demon',
    maxHp: 100,
    currentHp: 60,
    attackPower: 15,
    rewards: { xp: 150, gold: 50, dropItemId: 'item-rare-gem' },
    status: 'active',
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z',
  };

  // Hit for 20
  const hit1 = applyBossDamage(boss, 20);
  assert.equal(hit1.boss.currentHp, 40);
  assert.equal(hit1.isDefeated, false);
  assert.equal(hit1.rewardsAwarded, undefined);

  // Hit for lethal (50)
  const hit2 = applyBossDamage(hit1.boss, 50);
  assert.equal(hit2.boss.currentHp, 0);
  assert.equal(hit2.boss.status, 'defeated');
  assert.equal(hit2.isDefeated, true);
  assert.deepEqual(hit2.rewardsAwarded, boss.rewards);
});

test('applyPlayerDamage mitigates damage via CON and detects fainting', () => {
  const player = createDefaultPlayerProfile('p1');
  // CON 10 = 20% mitigation (10 * 0.02). Raw damage 20 -> 16 mitigated damage
  const result = applyPlayerDamage(player, 20);
  assert.equal(result.rawDamage, 20);
  assert.equal(result.mitigatedDamage, 16);
  assert.equal(result.player.hp, 84);
  assert.equal(result.isFainted, false);

  // Fatal damage
  const fatalResult = applyPlayerDamage(result.player, 200);
  assert.equal(fatalResult.player.hp, 0);
  assert.equal(fatalResult.isFainted, true);
});

test('useStreakShield and awardStreakShield manage streak protection', () => {
  let player = createDefaultPlayerProfile('p1');
  assert.equal(player.streakShields, 0);

  // Attempt to use with 0 shields
  const failUse = useStreakShield(player);
  assert.equal(failUse.success, false);
  assert.equal(failUse.updatedPlayer.streakShields, 0);

  // Award 2 shields
  player = awardStreakShield(player, 2);
  assert.equal(player.streakShields, 2);

  // Use 1 shield
  const successUse = useStreakShield(player);
  assert.equal(successUse.success, true);
  assert.equal(successUse.updatedPlayer.streakShields, 1);
});
