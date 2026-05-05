import type { JSX } from "solid-js";
import { TaskInput } from "./components/TaskInput";
import { TaskList } from "./components/TaskList";

const handleTaskSubmit = (_text: string): void => {
  // Story 1.8 wires the optimistic create flow via TanStack Query.
  // Until then, the captured task is intentionally dropped.
};

export function App(): JSX.Element {
  return (
    <main class="app-shell">
      <TaskInput onSubmit={handleTaskSubmit} />
      <TaskList />
    </main>
  );
}
