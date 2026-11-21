// SyncTransport over a PocketBase `records` collection (see backend/pocketbase/pb_migrations).
// Depends only on a minimal structural subset of the PocketBase JS SDK, so core stays dependency-free.

import { versionOf, type SyncEntity, type SyncItem } from './repo.ts';
import type { RemoteItem, SyncTransport } from './sync.ts';

export interface PbRecord {
  id: string;
  updated: string;
  [field: string]: unknown;
}

export interface PbCollection {
  getList(page: number, perPage: number, options?: { filter?: string; sort?: string }): Promise<{ items: PbRecord[] }>;
  getFirstListItem(filter: string): Promise<PbRecord>;
  create(body: Record<string, unknown>): Promise<PbRecord>;
  update(id: string, body: Record<string, unknown>): Promise<PbRecord>;
}

export interface PbLike {
  collection(name: string): PbCollection;
}

export const RECORDS_COLLECTION = 'records';

const ENTITIES: readonly SyncEntity[] = ['habits', 'habit_logs', 'tasks', 'rewards'];

// Filter values go into PocketBase filter strings. Always quote and escape them.
export function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const isNotFound = (error: unknown) => (error as { status?: number } | null)?.status === 404;

function toRemoteItem(row: PbRecord): RemoteItem | null {
  const data = row.data as { id?: unknown } | null;
  if (!ENTITIES.includes(row.entity as SyncEntity) || !data || typeof data !== 'object' || typeof data.id !== 'string') return null;
  return { entity: row.entity as SyncEntity, record: data as SyncItem['record'], cursor: row.updated };
}

export function createPocketBaseTransport(pb: PbLike, userId: string): SyncTransport {
  const records = pb.collection(RECORDS_COLLECTION);

  return {
    async push(items) {
      for (const { entity, record } of items) {
        const version = versionOf(record);
        let existing: PbRecord | null = null;
        try {
          existing = await records.getFirstListItem(`entity = ${quote(entity)} && cid = ${quote(record.id)}`);
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
        if (!existing) {
          await records.create({ user: userId, entity, cid: record.id, version, data: record });
        } else if (String(existing.version) < version) {
          // ponytail: read-then-write can race with another device; a server hook comparing versions closes it
          await records.update(existing.id, { version, data: record });
        }
      }
    },

    async pull(cursor, limit) {
      const page = await records.getList(1, limit, {
        filter: cursor ? `updated >= ${quote(cursor)}` : '',
        sort: 'updated,id',
      });
      // Malformed rows are skipped. The cursor only advances past valid rows; re-reading a skipped row is harmless.
      const items: RemoteItem[] = [];
      for (const row of page.items) {
        const item = toRemoteItem(row);
        if (item) items.push(item);
      }
      return items;
    },
  };
}
