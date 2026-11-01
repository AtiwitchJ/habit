# AGENTS.md — Habit Tracker Development & Global Skills Orchestration

> **Single Source of Truth** for AI Agents (Antigravity, Claude, Hermes, Codex) working on the Habit Tracker ecosystem.
> This file establishes the operational standards, architectural invariants, and the **Global Skills Orchestration Matrix** to achieve maximum efficiency and zero regression.

---

## 1. Project Overview & Topology

Habit Tracker is a local-first, multi-platform personal habit tracker designed for high privacy, offline durability, and reliable cloud synchronization.

### Monorepo Structure
* `packages/core/`: **Pure domain logic** (TS with Node type stripping). Zero external runtime dependencies, zero I/O. Holds date rollover, streak calculation, repos (memory & storage), UUIDv7, sync engine, and habit templates.
* `apps/web/`: **Vite + React SPA** (Warm, friendly UI; Fredoka/Nunito type; local storage + PocketBase sync).
* `backend/pocketbase/`: **Self-hosted backend** (PocketBase server, migrations in `pb_migrations/1_records.js`, user auth, data backup).
* `packages/db/`: Portable SQLite / Postgres schema (`schema.sql`).
* `docs/`: Architecture blueprints (`ARCHITECTURE.md`) and Superpowers specs/plans (`docs/superpowers/`).

### Live Environment (`100.105.249.12`)
* **Port 8081:** Habit Web App (Production SPA).
* **Port 8090:** PocketBase Backend (`/api/health`, Admin UI at `/_/`).
* **Port 8080:** Workout Log App (`gym`) — *Do NOT conflict with or overwrite this port!*

---

## 2. Global Skills Orchestration Matrix

To operate at maximum efficiency, agents MUST proactively detect intent and invoke the corresponding global skills (`~/.gemini/config/skills` and plugins). Follow this lifecycle strictly:

```
[User Request]
       │
       ▼
[0. Progressive Disclosure] ──► using-superpowers (Always active)
       │
       ├─► Feature / Enhancement? ──► 1. Intake: brainstorming / grill-me + karpathy-guidelines
       │                                     │
       │                                     ▼
       │                              2. Planning: writing-plans + api-and-interface-design
       │                                     │
       │                                     ▼
       │                              3. Execution: subagent-driven-development + TDD
       │                                     │
       │                                     ▼
       │                              4. Frontend: frontend-design / ui-ux-pro-max
       │
       ├─► Bug / Failure?         ──► 5. Investigation: systematic-debugging + bug-hunter
       │
       └─► Security / Auth?       ──► 6. Hardening: owasp-security + security-and-hardening
                                             │
                                             ▼
                                      7. Verification Gate: verification-before-completion
                                             │
                                             ▼
                                      8. Context Economy: caveman / cavecrew (Compress output)
```

### Skill Dispatch Reference

| Lifecycle Phase | Global Skill | When to Trigger | Expected Outcome / Standard |
|---|---|---|---|
| **Intake & Clarification** | `superpowers:brainstorming` | New features, UI/UX additions, functional changes | Clarify 1 question at a time; propose 2-3 approaches; get approval before code. |
| | `grill-me` | Complex architectural decisions or tradeoffs | Interactive design interview to stress-test requirements. |
| | `karpathy-guidelines` | All coding turns | Avoid over-engineering, make surgical edits, avoid premature abstractions. |
| **API & Architecture** | `api-and-interface-design` | Changes touching `packages/core` or data contracts | Strict typing, clean boundaries between core and apps. |
| | `project-docs` / `diataxis` | Updating specs, architectural changes | Keep `docs/ARCHITECTURE.md` and `docs/superpowers/` synchronized. |
| **Execution** | `superpowers:writing-plans` | Tasks with >1 step | Write detailed, checkbox-driven implementation plans. |
| | `superpowers:subagent-driven-development` | Multi-task plans in session | Dispatch focused subagents per task with review checkpoints. |
| | `superpowers:test-driven-development` | Adding logic to `packages/core` | Write failing test first (`test/*.test.ts`), confirm failure, then write minimal passing code. |
| **UI/UX Design** | `frontend-design` | Creating or updating screens/components | Avoid generic templates; build warm, purposeful, high-craft aesthetics. |
| | `design-taste-frontend` | Landing pages, dashboards, visual polish | Enforce no-slop typography, responsive hierarchy, and palette harmony. |
| | `ui-ux-pro-max` / `ui-styling` | Component design, state feedback, themes | Proper micro-animations, accessible buttons, Dark Mode tokens. |
| **Quality & Security** | `superpowers:systematic-debugging` | Unexpected bugs, test failures | Trace root cause with evidence; do not guess or shotgun fix. |
| | `bug-hunter` | Deep audits, edge-case regressions | Check boundary dates, leap years, timezone offsets, offline queues. |
| | `owasp-security` / `security-and-hardening` | PocketBase API rules, auth, OAuth | Validate client inputs, escape query filters, enforce user-isolation rules. |
| **Verification Gate** | `superpowers:verification-before-completion` | Before declaring any task complete | Execute test and build commands; verify real output; no assumptions. |
| **Token Economy** | `caveman` / `cavecrew` | Multi-turn subagent execution | Terse, compact subagent outputs to conserve context window. |

---

## 3. Core Architecture Rules & Non-Negotiables

1. **`packages/core` Isolation:**
   * NEVER import UI libraries (React, CSS), Node I/O (`fs`, `net`), or browser globals (`window`, `localStorage`) inside `packages/core/src/`.
   * Keep it pure TypeScript that executes directly under `node --experimental-strip-types`.
2. **Logical Date Invariant:**
   * NEVER use raw `new Date().toISOString().slice(0, 10)` for habit completion dates.
   * ALWAYS use `toLogicalDate(instant, safeBoundary(timeZone, rolloverMinutes))` from `@habit/core/logical-date`.
   * Habits before 04:00 AM (or user-defined rollover) belong to the previous logical day.
3. **Deletions are Tombstones:**
   * NEVER physically delete records (`DELETE FROM` or array filtering) in synced repositories.
   * ALWAYS set `deletedAt = new Date().toISOString()`. The sync engine uses tombstones to resolve distributed conflicts and prevent resurrection.
4. **State-Based LWW Sync:**
   * PocketBase records use Last-Write-Wins based on `versionOf(record)`.
   * On ties, tombstones win.
5. **Port & Host Integrity:**
   * Habit web must bind to port 8081 or dev port 5173.
   * PocketBase binds to 8090.
   * Never interfere with port 8080 (`gym` app).

---

## 4. Verification & Testing Playbook

Before reporting completion or committing changes, run and verify:

```bash
# 1. Run all core domain logic tests (64+ tests)
node --test --experimental-strip-types packages/core/test/*.test.ts

# 2. Typecheck Web App
bun run --cwd apps/web typecheck

# 3. Production Build Web App
bun run --cwd apps/web build
```

*All 3 commands must exit with code 0.*

---

## 5. Current Gap Roadmap (Prioritized Backlog)

When planning upcoming sprints, reference these identified missing gaps:

1. **Habit Lifecycle Management:**
   * Edit Habit (Name, Target, Unit, Color, Icon, Schedule).
   * Delete Habit (with confirmation + tombstone) & Archive Habit.
   * Reorder / Pin habits on Today screen.
2. **Core Feature Exposure in UI:**
   * **Skip / Freeze UI:** Let users excuse a day (sick/travel) without breaking streaks.
   * **Check-in Notes:** Optional journal/note per check-in log.
3. **Stage 2 Gamification:**
   * Streak Milestones (7, 21, 30, 100 days) + Badges.
   * Daily & Weekly Completion Rate statistics.
   * Confetti / Sound celebration on daily goal completion.
4. **Stage 3 Thai Localization & Starter Packs:**
   * Bilingual UI (Thai / English toggle).
   * Thai translation for 123 template items.
   * Goal-based starter packs ("Morning Routine", "Office Syndrome Prevention", "Weight Loss").
5. **Platform Experience & PWA:**
   * Full PWA setup (`vite-plugin-pwa`, Service Worker, manifest, offline badge).
   * Dark Mode theme toggle.
   * Web Notifications for habit `reminderTime`.
   * Data Export / Import (JSON / CSV backup).
