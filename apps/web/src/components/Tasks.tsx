import { useCallback, useEffect, useState } from 'react';
import { orderTasks } from '@habit/core/tasks';
import type { TaskRecord } from '@habit/core/repo';
import { repo } from '../repo-local.ts';

// One-off to-dos beside habits. Deleting writes a tombstone (repo.removeTask), so sync never resurrects a task.
export function Tasks({ today }: { today: string }) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => setTasks(orderTasks(await repo.listTasks())), []);
  useEffect(() => {
    void reload();
    return repo.subscribe(() => void reload());
  }, [reload]);

  const act = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="card">
      <h2>Tasks</h2>
      <form
        className="task-add"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return setError('Task title is required.');
          void act(async () => {
            await repo.addTask({ title: trimmed, dueDate: dueDate || undefined });
            setTitle('');
            setDueDate('');
          });
        }}
      >
        <input aria-label="New task" placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button type="submit" className="primary">Add</button>
      </form>
      {error && <p className="error">{error}</p>}
      {tasks.length === 0 ? (
        <p>No tasks yet.</p>
      ) : (
        <ul className="history-list">
          {tasks.map((task) => (
            <li key={task.id} className="history-item">
              <label>
                <input
                  type="checkbox"
                  checked={!!task.doneAt}
                  onChange={() => void act(() => repo.updateTask(task.id, { doneAt: task.doneAt ? null : new Date().toISOString() }))}
                />{' '}
                <span style={task.doneAt ? { textDecoration: 'line-through' } : undefined}>{task.title}</span>
              </label>
              {task.dueDate && <small className={!task.doneAt && task.dueDate < today ? 'error' : undefined}> · due {task.dueDate}</small>}{' '}
              <button type="button" aria-label={`Delete task ${task.title}`} onClick={() => void act(() => repo.removeTask(task.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
