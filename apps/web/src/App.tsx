import type { JSX } from "solid-js";
import { TaskInput } from "./components/TaskInput";
import { TaskList } from "./components/TaskList";
import { useCreateTask } from "./data/queries";
import { createUuidV7 } from "./data/uuid";

export function App(): JSX.Element {
  const createTask = useCreateTask();
  const handleTaskSubmit = (text: string): void => {
    createTask.mutate({ id: createUuidV7(), text });
  };
  return (
    <main class="app-shell">
      <TaskInput onSubmit={handleTaskSubmit} />
      <TaskList />
    </main>
  );
}
