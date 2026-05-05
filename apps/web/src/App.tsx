import { onCleanup, onMount, type JSX } from "solid-js";
import { UndoSnackbar } from "./components/UndoSnackbar";
import { TaskInput } from "./components/TaskInput";
import { TaskList } from "./components/TaskList";
import { useCreateTask, useUndoAll } from "./data/queries";
import { createUuidV7 } from "./data/uuid";

export function App(): JSX.Element {
  const createTask = useCreateTask();
  const handleUndo = useUndoAll();

  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(
      (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ??
        navigator.platform,
    );

  const handleKeyDown = (e: KeyboardEvent): void => {
    if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      handleUndo();
    }
  };

  onMount(() => document.addEventListener("keydown", handleKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleKeyDown));

  const handleTaskSubmit = (text: string): void => {
    createTask.mutate({ id: createUuidV7(), text });
  };

  return (
    <main class="app-shell">
      <TaskInput onSubmit={handleTaskSubmit} />
      <TaskList />
      <UndoSnackbar />
    </main>
  );
}
