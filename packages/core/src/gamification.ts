import { uuidv7 } from './ids.ts';

export type HabitDifficulty = 'trivial' | 'easy' | 'medium' | 'hard';

export type CharacterAttribute = 'str' | 'int' | 'con' | 'per';

export interface PlayerAttributes {
  str: number; // Strength: fitness, physical energy, workout habit bonus
  int: number; // Intelligence: learning, coding, deep work habit bonus
  con: number; // Constitution: health, sleep, damage mitigation from missed habits
  per: number; // Perception: mindfulness, gold finding, rare loot drop rate
}

export interface PlayerProfile {
  id: string;
  level: number;
  currentXp: number;
  nextLevelXp: number;
  hp: number;
  maxHp: number;
  gold: number;
  attributes: PlayerAttributes;
  streakShields: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestReward {
  xp: number;
  gold: number;
  dropItemId?: string;
}

export type BossStatus = 'active' | 'defeated' | 'expired';

export interface BossRecord {
  id: string;
  name: string;
  description?: string;
  maxHp: number;
  currentHp: number;
  attackPower: number;
  rewards: QuestReward;
  status: BossStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BossDamageResult {
  boss: BossRecord;
  damageDealt: number;
  isDefeated: boolean;
  rewardsAwarded?: QuestReward;
}

export interface PlayerDamageResult {
  player: PlayerProfile;
  rawDamage: number;
  mitigatedDamage: number;
  isFainted: boolean;
}

export interface LevelUpResult {
  leveledUp: boolean;
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  statPointsGained: number;
  hpRestored: number;
}

export interface GamificationConfig {
  baseXp: Record<HabitDifficulty, number>;
  baseGold: Record<HabitDifficulty, number>;
  streakMultiplierPerDay: number;
  maxStreakMultiplier: number;
  levelCurveBase: number;
  levelCurveExponent: number;
  baseMaxHp: number;
  hpPerCon: number;
  conDamageMitigationPercent: number;
  statPointsPerLevel: number;
}

export const DEFAULT_GAMIFICATION_CONFIG: GamificationConfig = {
  baseXp: {
    trivial: 5,
    easy: 10,
    medium: 20,
    hard: 40,
  },
  baseGold: {
    trivial: 1,
    easy: 3,
    medium: 7,
    hard: 15,
  },
  streakMultiplierPerDay: 0.05,
  maxStreakMultiplier: 2.0,
  levelCurveBase: 100,
  levelCurveExponent: 1.5,
  baseMaxHp: 50,
  hpPerCon: 5,
  conDamageMitigationPercent: 0.02,
  statPointsPerLevel: 5,
};

export function calculateMaxHp(
  con: number,
  level: number = 1,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG
): number {
  return Math.max(10, config.baseMaxHp + con * config.hpPerCon + Math.max(0, level - 1) * 10);
}

export function createDefaultPlayerProfile(
  id: string = uuidv7(),
  overrides?: Partial<PlayerProfile>,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG
): PlayerProfile {
  const now = new Date().toISOString();
  const attributes: PlayerAttributes = {
    str: 10,
    int: 10,
    con: 10,
    per: 10,
    ...(overrides?.attributes ?? {}),
  };
  const level = overrides?.level ?? 1;
  const maxHp = overrides?.maxHp ?? calculateMaxHp(attributes.con, level, config);
  const hp = overrides?.hp ?? maxHp;
  const nextLevelXp = overrides?.nextLevelXp ?? calculateNextLevelXp(level, config);

  return {
    id,
    level,
    currentXp: overrides?.currentXp ?? 0,
    nextLevelXp,
    hp,
    maxHp,
    gold: overrides?.gold ?? 0,
    attributes,
    streakShields: overrides?.streakShields ?? 0,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

export function calculateNextLevelXp(level: number, config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.floor(config.levelCurveBase * Math.pow(safeLevel, config.levelCurveExponent));
}

export function calculateXpGain(
  difficulty: HabitDifficulty,
  streakDays: number = 0,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG
): number {
  const base = config.baseXp[difficulty] ?? config.baseXp.easy;
  const streakBonus = Math.min(
    1 + Math.max(0, streakDays - 1) * config.streakMultiplierPerDay,
    config.maxStreakMultiplier
  );
  return Math.round(base * streakBonus);
}

export function calculateGoldGain(
  difficulty: HabitDifficulty,
  streakDays: number = 0,
  perAttribute: number = 0,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG
): number {
  const base = config.baseGold[difficulty] ?? config.baseGold.easy;
  const perBonus = 1 + Math.max(0, perAttribute) * 0.02;
  const streakBonus = 1 + Math.min(Math.max(0, streakDays - 1) * 0.02, 0.5);
  return Math.max(1, Math.round(base * perBonus * streakBonus));
}

export function checkLevelUp(
  currentXp: number,
  currentLevel: number,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG
): { canLevelUp: boolean; nextLevelXp: number; remainingXp: number } {
  const nextLevelXp = calculateNextLevelXp(currentLevel, config);
  const canLevelUp = currentXp >= nextLevelXp;
  return {
    canLevelUp,
    nextLevelXp,
    remainingXp: canLevelUp ? currentXp - nextLevelXp : currentXp,
  };
}

export function applyXp(
  player: PlayerProfile,
  xpEarned: number,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG
): { updatedPlayer: PlayerProfile; levelUpResult: LevelUpResult } {
  const now = new Date().toISOString();
  let currentXp = player.currentXp + Math.max(0, xpEarned);
  let level = player.level;
  let nextLevelXp = player.nextLevelXp || calculateNextLevelXp(level, config);
  let statPointsGained = 0;
  const initialLevel = level;

  while (currentXp >= nextLevelXp) {
    currentXp -= nextLevelXp;
    level += 1;
    statPointsGained += config.statPointsPerLevel;
    nextLevelXp = calculateNextLevelXp(level, config);
  }

  const leveledUp = level > initialLevel;
  const maxHp = calculateMaxHp(player.attributes.con, level, config);
  const hp = leveledUp ? maxHp : player.hp;

  const updatedPlayer: PlayerProfile = {
    ...player,
    level,
    currentXp,
    nextLevelXp,
    hp,
    maxHp,
    updatedAt: now,
  };

  const levelUpResult: LevelUpResult = {
    leveledUp,
    previousLevel: initialLevel,
    newLevel: level,
    levelsGained: level - initialLevel,
    statPointsGained,
    hpRestored: leveledUp ? maxHp - player.hp : 0,
  };

  return { updatedPlayer, levelUpResult };
}

export function calculateHabitDamageToBoss(
  difficulty: HabitDifficulty,
  streakDays: number = 0,
  strAttribute: number = 0,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG
): number {
  const baseDamageMap: Record<HabitDifficulty, number> = {
    trivial: 5,
    easy: 10,
    medium: 25,
    hard: 50,
  };
  const base = baseDamageMap[difficulty] ?? 10;
  const strBonus = 1 + Math.max(0, strAttribute) * 0.02;
  const streakBonus = Math.min(
    1 + Math.max(0, streakDays - 1) * config.streakMultiplierPerDay,
    config.maxStreakMultiplier
  );
  return Math.max(1, Math.round(base * strBonus * streakBonus));
}

export function applyBossDamage(boss: BossRecord, damage: number): BossDamageResult {
  const now = new Date().toISOString();
  const effectiveDamage = Math.max(0, Math.floor(damage));
  const damageDealt = Math.min(boss.currentHp, effectiveDamage);
  const currentHp = Math.max(0, boss.currentHp - damageDealt);
  const isDefeated = currentHp === 0;
  const status: BossStatus = isDefeated ? 'defeated' : boss.status;

  const updatedBoss: BossRecord = {
    ...boss,
    currentHp,
    status,
    updatedAt: now,
  };

  return {
    boss: updatedBoss,
    damageDealt,
    isDefeated,
    rewardsAwarded: isDefeated ? boss.rewards : undefined,
  };
}

export function applyPlayerDamage(
  player: PlayerProfile,
  rawDamage: number,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG
): PlayerDamageResult {
  const now = new Date().toISOString();
  const safeDamage = Math.max(0, Math.floor(rawDamage));
  const conMitigation = Math.min(0.5, Math.max(0, player.attributes.con) * config.conDamageMitigationPercent);
  const mitigatedDamage = Math.max(1, Math.round(safeDamage * (1 - conMitigation)));
  const hp = Math.max(0, player.hp - mitigatedDamage);
  const isFainted = hp === 0;

  const updatedPlayer: PlayerProfile = {
    ...player,
    hp,
    updatedAt: now,
  };

  return {
    player: updatedPlayer,
    rawDamage: safeDamage,
    mitigatedDamage,
    isFainted,
  };
}

export function useStreakShield(player: PlayerProfile): { success: boolean; updatedPlayer: PlayerProfile } {
  if (player.streakShields <= 0) {
    return { success: false, updatedPlayer: player };
  }
  const now = new Date().toISOString();
  return {
    success: true,
    updatedPlayer: {
      ...player,
      streakShields: player.streakShields - 1,
      updatedAt: now,
    },
  };
}

export function awardStreakShield(player: PlayerProfile, count: number = 1): PlayerProfile {
  const now = new Date().toISOString();
  return {
    ...player,
    streakShields: player.streakShields + Math.max(1, count),
    updatedAt: now,
  };
}
