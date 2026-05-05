import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { LOADING_DELAY_MS } from "../constants";
import { LIST_FETCH_ERROR_COPY } from "../data/announcements";
import type { Task } from "../data/api";
import { useTasks } from "../data/queries";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { TaskRow } from "./TaskRow";
import "./TaskList.css";

export function TaskList(): JSX.Element {
  const query = useTasks();
  const [showLoading, setShowLoading] = createSignal(false);
  // Mirror TanStack data into a Solid store keyed by task id. Reconcile preserves
  // object identity for unchanged items so the keyed <For> below does not remount
  // a row on optimistic field updates (which would drop keyboard focus).
  const [tasks, setTasks] = createStore<Task[]>([]);

  createEffect(() => {
    setTasks(reconcile(query.data ?? [], { key: "id" }));
  });

  createEffect(() => {
    if (query.isPending) {
      const timer = setTimeout(() => setShowLoading(true), LOADING_DELAY_MS);
      onCleanup(() => clearTimeout(timer));
    } else {
      setShowLoading(false);
    }
  });

  return (
    <div class="task-list-region">
      <Show when={!query.isError} fallback={<ListFetchError onRetry={() => query.refetch()} />}>
        <Show
          when={!query.isPending}
          fallback={
            <Show when={showLoading()}>
              <LoadingState />
            </Show>
          }
        >
          <Show when={tasks.length > 0} fallback={<EmptyState />}>
            <ul role="list" class="task-list">
              <For each={tasks}>{(task) => <TaskRow task={task} />}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function ListFetchError(props: { onRetry: () => void }): JSX.Element {
  return (
    <div class="task-list-error">
      <p class="task-list-error__message">{LIST_FETCH_ERROR_COPY}</p>
      <button type="button" onClick={() => props.onRetry()} class="task-list-error__retry">
        Retry
      </button>
    </div>
  );
}
