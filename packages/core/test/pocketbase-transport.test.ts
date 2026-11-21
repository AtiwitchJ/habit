import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, type NewHabit } from '../src/repo.ts';
import { createPocketBaseTransport, quote, type PbCollection, type PbLike, type PbRecord } from '../src/pocketbase-transport.ts';
import { createSyncEngine, emptySyncState } from '../src/sync.ts';

const water: NewHabit = { name: 'Drink water', kind: 'quantitative', target: 2000, unit: 'ml', schedule: { type: 'daily' }, startDate: '2026-10-29' };

class FakePb implements PbLike {
  rows: PbRecord[] = [];
  filters: string[] = [];
  counter = 0;
  failWith: unknown = null;

  private stamp() {
    return `2026-11-01 10:00:${String(++this.counter).padStart(2, '0')}.000Z`;
  }

  collection(): PbCollection {
    return {
      getFirstListItem: async (filter) => {
        this.filters.push(filter);
        if (this.failWith) throw this.failWith;
        const m = /^entity = "(.*)" && cid = "(.*)"$/.exec(filter);
        const row = this.rows.find((r) => m && r.entity === m[1] && r.cid === m[2].replace(/\\(.)/g, '$1'));
        if (!row) throw Object.assign(new Error('not found'), { status: 404 });
        return row;
      },
      create: async (body) => {
        const row = { id: `pb${this.rows.length + 1}`, updated: this.stamp(), ...body } as PbRecord;
        this.rows.push(row);
        return row;
      },
      update: async (id, body) => {
        const row = this.rows.find((r) => r.id === id)!;
        Object.assign(row, body, { updated: this.stamp() });
        return row;
      },
      getList: async (_page, perPage, options) => {
        this.filters.push(options?.filter ?? '');
        const m = /^updated >= "(.*)"$/.exec(options?.filter ?? '');
        const items = this.rows
          .filter((r) => !m || r.updated >= m[1])
          .sort((a, b) => a.updated.localeCompare(b.updated) || a.id.localeCompare(b.id))
          .slice(0, perPage);
        return { items };
      },
    };
  }
}

test('quote escapes quotes and backslashes', () => {
  assert.equal(quote('abc'), '"abc"');
  assert.equal(quote('a"b\\c'), '"a\\"b\\\\c"');
});

test('push creates rows with owner, entity, cid, version and full data', async () => {
  const pb = new FakePb();
  const repo = createMemoryRepo();
  const h = await repo.addHabit(water);
  await createPocketBaseTransport(pb, 'user1').push(repo.snapshot());
  assert.equal(pb.rows.length, 1);
  assert.deepEqual({ user: pb.rows[0].user, entity: pb.rows[0].entity, cid: pb.rows[0].cid }, { user: 'user1', entity: 'habits', cid: h.id });
  assert.deepEqual(pb.rows[0].data, h);
});

test('rewards push and pull through PocketBase without duplicating on replay', async () => {
  const pb = new FakePb();
  const transport = createPocketBaseTransport(pb, 'user1');
  const reward = { id: 'log1', logId: 'log1', xp: 10, gold: 2, createdAt: '2026-10-30T10:00:00.000Z' };
  const item = { entity: 'rewards' as const, record: reward };

  await transport.push([item]);
  await transport.push([item]);

  assert.equal(pb.rows.length, 1);
  assert.equal(pb.rows[0].entity, 'rewards');
  assert.deepEqual((await transport.pull(null, 100)).map(({ entity, record }) => ({ entity, record })), [item]);
});

test('push updates only when local version is newer', async () => {
  const pb = new FakePb();
  const transport = createPocketBaseTransport(pb, 'user1');
  const repo = createMemoryRepo({ now: () => new Date('2026-10-30T10:00:00Z') });
  const h = await repo.addHabit(water);
  await transport.push(repo.snapshot());
  const first = pb.rows[0].updated;

  await transport.push(repo.snapshot()); // same version
  assert.equal(pb.rows[0].updated, first);

  const newer = { entity: 'habits' as const, record: { ...h, name: 'Water', updatedAt: '2026-10-31T10:00:00.000Z' } };
  await transport.push([newer]);
  assert.notEqual(pb.rows[0].updated, first);
  assert.equal((pb.rows[0].data as { name: string }).name, 'Water');

  const older = { entity: 'habits' as const, record: { ...h, name: 'Old', updatedAt: '2026-10-29T10:00:00.000Z' } };
  await transport.push([older]);
  assert.equal((pb.rows[0].data as { name: string }).name, 'Water');
});

test('push escapes ids in filters and rethrows non-404 errors', async () => {
  const pb = new FakePb();
  const transport = createPocketBaseTransport(pb, 'user1');
  const repo = createMemoryRepo();
  const h = await repo.addHabit(water);
  await transport.push([{ entity: 'habits', record: { ...h, id: 'a"b' } }]);
  assert.equal(pb.filters[0], 'entity = "habits" && cid = "a\\"b"');

  pb.failWith = Object.assign(new Error('boom'), { status: 500 });
  await assert.rejects(() => transport.push(repo.snapshot()), /boom/);
});

test('pull returns valid rows with server cursor and skips malformed ones', async () => {
  const pb = new FakePb();
  const repo = createMemoryRepo();
  await repo.addHabit(water);
  const transport = createPocketBaseTransport(pb, 'user1');
  await transport.push(repo.snapshot());
  pb.rows.push({ id: 'bad1', updated: '2026-11-01 11:00:00.000Z', entity: 'other', data: { id: 'x' } } as PbRecord);
  pb.rows.push({ id: 'bad2', updated: '2026-11-01 11:00:01.000Z', entity: 'habits', data: null } as PbRecord);

  const items = await transport.pull(null, 100);
  assert.equal(items.length, 1);
  assert.equal(items[0].cursor, pb.rows[0].updated);
  assert.equal(pb.filters.at(-1), '');

  await transport.pull('2026-11-01 10:00:01.000Z', 100);
  assert.equal(pb.filters.at(-1), 'updated >= "2026-11-01 10:00:01.000Z"');
});

test('two devices converge through the PocketBase transport', async () => {
  const pb = new FakePb();
  const mk = (t: number) => {
    const repo = createMemoryRepo({ now: () => new Date(1_700_000_000_000 + t * 1000) });
    const engine = createSyncEngine({ store: repo, transport: createPocketBaseTransport(pb, 'user1'), state: emptySyncState(), save: () => {} });
    return { repo, engine };
  };
  const a = mk(1);
  const b = mk(50);
  const h = await a.repo.addHabit(water);
  await a.repo.addLog({ habitId: h.id, logicalDate: '2026-10-30', kind: 'complete', value: 200, occurredAt: '2026-10-30T10:00:00.000Z', isRetroactive: false });
  await a.engine.sync();
  await b.engine.sync();
  assert.equal((await b.repo.listLogs(h.id)).length, 1);

  await b.repo.updateHabit(h.id, { name: 'From B' });
  await b.engine.sync();
  await a.engine.sync();
  assert.equal((await a.repo.listHabits())[0].name, 'From B');
});
