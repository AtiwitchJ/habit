import type PocketBase from 'pocketbase';
import type { SyncStatus } from '../sync-runner.ts';
import { wipeLocalData } from '../cloud.ts';

function describe(status: SyncStatus): string {
  if (status.state === 'syncing') return 'Syncing…';
  if (status.state === 'offline') return 'Offline. Changes sync when you reconnect.';
  if (status.state === 'error') return `Sync failed: ${status.error}`;
  return status.lastSyncedAt ? `Synced ${status.lastSyncedAt.toLocaleTimeString()}` : 'Synced';
}

export function AccountBar({ pb, userId, email, status }: { pb: PocketBase; userId: string; email: string; status: SyncStatus }) {
  async function deleteAccount() {
    if (!confirm('Delete your account and all synced data? This cannot be undone.')) return;
    try {
      await pb.collection('users').delete(userId);
    } catch (e) {
      alert(`Could not delete account: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    pb.authStore.clear();
    wipeLocalData(userId);
    location.reload();
  }

  return (
    <div className="account">
      <span>
        {email} · {describe(status)}
      </span>
      <button onClick={() => pb.authStore.clear()}>Sign out</button>
      <button onClick={() => void deleteAccount()}>Delete account</button>
    </div>
  );
}
