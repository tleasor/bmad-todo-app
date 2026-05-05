import { createStore, reconcile } from "solid-js/store";

export type ToggleSyncStatus = "pending" | "exhausted";
export type ToggleSyncEntry = { status: ToggleSyncStatus; retry: () => void };

const [entries, setEntries] = createStore<Record<string, ToggleSyncEntry | undefined>>({});

export const useToggleSyncStatus =
  (id: () => string): (() => ToggleSyncEntry | undefined) =>
  () =>
    entries[id()];

export const __toggleSyncStorePeek = (id: string): ToggleSyncEntry | undefined => entries[id];

export const __toggleSyncMutators = {
  markPending: (id: string, retry: () => void): void =>
    setEntries(id, { status: "pending", retry }),
  markExhausted: (id: string, retry: () => void): void =>
    setEntries(id, { status: "exhausted", retry }),
  clear: (id: string): void => setEntries(id, undefined),
};

export const __resetToggleSyncStoreForTests = (): void => {
  setEntries(reconcile({}));
};
