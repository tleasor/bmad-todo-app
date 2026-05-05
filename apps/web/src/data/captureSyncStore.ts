import { createStore, reconcile } from "solid-js/store";

export type CaptureSyncStatus = "pending" | "exhausted";
export type CaptureSyncEntry = { status: CaptureSyncStatus; retry: () => void };

const [entries, setEntries] = createStore<Record<string, CaptureSyncEntry | undefined>>({});

export const useCaptureSyncStatus =
  (id: () => string): (() => CaptureSyncEntry | undefined) =>
  () =>
    entries[id()];

// Non-reactive read used inside `useCreateTask`'s lifecycle callbacks so the
// hook can branch on prior status without subscribing to the store.
export const __captureSyncStorePeek = (id: string): CaptureSyncEntry | undefined => entries[id];

export const __captureSyncMutators = {
  markPending: (id: string, retry: () => void): void =>
    setEntries(id, { status: "pending", retry }),
  markExhausted: (id: string, retry: () => void): void =>
    setEntries(id, { status: "exhausted", retry }),
  clear: (id: string): void => setEntries(id, undefined),
};

export const __resetCaptureSyncStoreForTests = (): void => {
  setEntries(reconcile({}));
};
