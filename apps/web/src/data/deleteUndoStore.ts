import { createStore, reconcile } from "solid-js/store";
import type { Task } from "./api";

export type DeleteUndoEntry = {
  task: Task;
  index: number;
  deletedAt: number;
};

const [entries, setEntries] = createStore<Record<string, DeleteUndoEntry | undefined>>({});

export const deleteUndoStoreEntries = entries;

export const deleteUndoStorePeek = (id: string): DeleteUndoEntry | undefined => entries[id];

export const deleteUndoStoreCount = (): number =>
  Object.values(entries).filter((e) => e !== undefined).length;

export const __deleteUndoMutators = {
  setEntry: (id: string, entry: DeleteUndoEntry): void => setEntries(id, entry),
  clearEntry: (id: string): void => setEntries(id, undefined),
  clearAll: (): void => setEntries(reconcile({})),
};

export const __resetDeleteUndoStoreForTests = (): void => {
  setEntries(reconcile({}));
};
