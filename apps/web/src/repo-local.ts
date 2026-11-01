import { createMemoryRepo, createStorageRepo, tryStorage } from '@habit/core/repo';

export const storage = tryStorage(() => window.localStorage);
export const persistent = storage !== null;
export const repo = storage ? createStorageRepo(storage) : createMemoryRepo();
