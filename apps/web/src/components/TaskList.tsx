import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { LOADING_DELAY_MS } from "../constants";
import { useTasks } from "../data/queries";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { TaskRow } from "./TaskRow";

export function TaskList(): JSX.Element {
  const query = useTasks();
  const [showLoading, setShowLoading] = createSignal(false);

  createEffect(() => {
    if (query.isPending) {
      const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    } else {
      setShowLoading(false);
    }
  });

  return (
    <div class="task-list-region mt-8">
      <Show when={!query.error}>
        <Show
          when={!query.isPending}
          fallback={
            <Show when={showLoading()}>
              <LoadingState />
            </Show>
          }
        >
          <Show when={(query.data ?? []).length > 0} fallback={<EmptyState />}>
            <ul role="list" class="task-list">
              <For each={query.data ?? []}>{(task) => <TaskRow task={task} />}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
