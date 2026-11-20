# Gamification & RPG Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the reverse-engineered RPG & Gamification mechanics into Habit Tracker end-to-end. Transform daily habit check-ins into engaging RPG actions featuring Player Levels, HP/XP progression, 4-Attribute stats (STR, INT, CON, PER), Gold Economy, Streak Freeze Shields, and Boss Battle mechanics.

**Architecture:** 
1. `@habit/core`: Wire `PlayerProfile` and `BossRecord` into `HabitRepo` and `RepoState` in `packages/core/src/repo.ts`. Hook `checkIn` to calculate XP/Gold gains and deal boss damage. Hook rollover to consume streak shields and apply boss retaliation damage.
2. `apps/web`: Build `PlayerHud.tsx`, `BossBattleCard.tsx`, and `LevelUpModal.tsx`. Mount the Player HUD at the top of `Today.tsx` with micro-animations and floating reward text.
3. Local-First Persistence: Extend `apps/web/src/repo-local.ts` to save and restore player state seamlessly.

**Tech Stack:** TypeScript (Node 22 `--experimental-strip-types`), React 19, Vite 8, Bun / pnpm, CSS Modules / Design Tokens.

Spec: `docs/gamification-re-spec.md`  
Domain Engine: `packages/core/src/gamification.ts`

---

## Global Constraints

- **Pure Core Logic:** `packages/core` has ZERO I/O and zero framework dependencies. All core logic must pass `node --test --experimental-strip-types packages/core/test/*.test.ts`.
- **Offline Durability:** Local storage and SQLite repositories must initialize default `PlayerProfile` (Level 1, 100 HP, 0 XP, 0 Gold) automatically if not found.
- **Tombstones & Non-destructive Updates:** All player state and quest status mutations use immutable updates or explicit timestamps.
- **Zero UI Regressions:** Existing habit check-ins, timers, tasks, and calendar views must retain 100% of their existing functionality and speed.

---

## Implementation Tasks

### Task 1: Core Domain Integration — Wiring Gamification to Repo & Check-in

**Files:**
- Modify: `packages/core/src/repo.ts`
- Modify: `packages/core/src/checkin.ts`
- Modify: `packages/core/src/gamification.ts`
- Test: `packages/core/test/gamification-repo.test.ts`

**Responsibilities:**
- Add `getPlayer(): Promise<PlayerProfile>` and `updatePlayer(patch: Partial<PlayerProfile>): Promise<PlayerProfile>` to `HabitRepo`.
- Add `listBosses(): Promise<BossRecord[]>`, `addBoss(boss: BossRecord): Promise<BossRecord>`, and `updateBoss(id: string, patch: Partial<BossRecord>): Promise<BossRecord>` to `HabitRepo`.
- Extend `RepoState` with optional `player?: PlayerProfile` and `bosses?: BossRecord[]`.
- In `checkin.ts`, create `checkInWithGamification(...)` which performs check-in, calculates XP/Gold, updates Player attributes based on habit category, and strikes active bosses.

- [ ] **Step 1: Write failing integration tests for HabitRepo player and boss methods**
- [ ] **Step 2: Update `HabitRepo` interface and `createMemoryRepo` in `repo.ts`**
- [ ] **Step 3: Implement `checkInWithGamification` in `checkin.ts` and verify with tests**

---

### Task 2: Local Storage & Repository Persistence Layer

**Files:**
- Modify: `apps/web/src/repo-local.ts`
- Modify: `packages/core/src/repo.ts` (export default player helpers)
- Test: `packages/core/test/repo.test.ts`

**Responsibilities:**
- Ensure browser local storage serialization handles `player` and `bosses` in `RepoState`.
- Initialize a welcoming default `PlayerProfile` (Level 1, 0 XP, 100 HP, 10 Gold, 1 Streak Shield) on first app boot.
- Provide a default starter World Boss (e.g., *"Sloth Monster"* / มอนสเตอร์แห่งความเกียจคร้าน, 200 HP).

- [ ] **Step 1: Update `repo-local.ts` to serialize/deserialize player profile and bosses**
- [ ] **Step 2: Add starter boss generation and profile bootstrap on first load**
- [ ] **Step 3: Verify local storage persistence across mock reloads**

---

### Task 3: Frontend Component Development — Player HUD & Rewards

**Files:**
- Create: `apps/web/src/components/PlayerHud.tsx`
- Create: `apps/web/src/components/BossBattleCard.tsx`
- Create: `apps/web/src/components/LevelUpModal.tsx`
- Modify: `apps/web/src/styles.css`

**UI Specs:**
- **PlayerHud:**
  - Level badge (e.g. `Lv. 1 Adventurer`)
  - HP Bar (red gradient, e.g. `100/100 HP`)
  - XP Progress Bar (violet/blue gradient, e.g. `25/50 XP`)
  - Gold counter (🪙 10)
  - Streak Shield indicator (🛡️ x1) with tooltip
- **BossBattleCard:**
  - Boss portrait/emoji, Name, and animated HP bar
  - Display player's accumulated damage for the day
- **LevelUpModal:**
  - Celebratory dialog showing new stats unlocked, full HP restore, and confetti trigger.

- [ ] **Step 1: Build `PlayerHud.tsx` and integrate design tokens**
- [ ] **Step 2: Build `BossBattleCard.tsx` with collapsible toggle**
- [ ] **Step 3: Build `LevelUpModal.tsx` with celebratory animation**

---

### Task 4: UI Screen Integration & Interactive Feedback

**Files:**
- Modify: `apps/web/src/screens/Today.tsx`
- Modify: `apps/web/src/components/HabitRow.tsx`
- Modify: `apps/web/src/App.tsx`

**Responsibilities:**
- Mount `PlayerHud` at the top of `Today.tsx`.
- Connect check-in clicks to trigger:
  - Floating reward feedback (e.g. `+10 XP`, `+2 Gold`, `💥 15 DMG`)
  - Haptic / sound effect trigger (optional/toggleable)
  - Level-up modal if XP threshold is reached.
- Provide a toggle in settings to show/hide RPG mode for users who prefer minimalist tracking.

- [ ] **Step 1: Integrate `PlayerHud` and state listeners in `Today.tsx`**
- [ ] **Step 2: Add floating micro-animations on habit check-in in `HabitRow.tsx`**
- [ ] **Step 3: Handle Boss damage deduction and Level-up triggers**

---

### Task 5: End-to-End Verification & Quality Audit

**Files:**
- Audit: All packages and apps
- Test commands: `pnpm test`, `bun run build`

**Acceptance Criteria:**
1. All core unit tests pass: `node --test packages/core/test/*.test.ts`
2. Web application builds with 0 errors: `pnpm --filter web build`
3. Check-in logs grant XP and Gold accurately according to difficulty and streak multiplier.
4. Streak Shield auto-consumes when skipping a day without breaking streak.
5. Fainting (HP reaches 0) triggers a gentle revival penalty without deleting user habits.

- [ ] **Step 1: Run complete test suite across packages/core**
- [ ] **Step 2: Execute web production build and verify bundle health**
- [ ] **Step 3: Final review and documentation sign-off**
