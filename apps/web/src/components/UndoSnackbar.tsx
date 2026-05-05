import { createMemo, Show, type JSX } from "solid-js";
import { deleteUndoStoreEntries } from "../data/deleteUndoStore";
import { useUndoAll } from "../data/queries";
import "./UndoSnackbar.css";

export function UndoSnackbar(): JSX.Element {
  const handleUndo = useUndoAll();
  const count = createMemo(
    () => Object.values(deleteUndoStoreEntries).filter((e) => e !== undefined).length,
  );

  return (
    <Show when={count() > 0}>
      <div role="status" aria-live="polite" class="undo-snackbar">
        <span>{count() === 1 ? "Task deleted" : `${count()} tasks deleted`}</span>
        <button type="button" class="undo-snackbar__button" onClick={handleUndo}>
          Undo
        </button>
      </div>
    </Show>
  );
}
