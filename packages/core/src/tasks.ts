import type { TaskRecord } from './repo.ts';

// Open tasks first, soonest due date first (undated last), then oldest first. Done tasks sink to the bottom.
export function orderTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((a, b) =>
    Number(!!a.doneAt) - Number(!!b.doneAt) ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
    a.createdAt.localeCompare(b.createdAt));
}
