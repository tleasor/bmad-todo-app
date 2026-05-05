import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { LOADING_DELAY_MS } from "../constants";
import { LIST_FETCH_ERROR_COPY } from "../data/announcements";
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
      <Show when={!query.isError} fallback={<ListFetchError onRetry={() => query.refetch()} />}>
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

function ListFetchError(props: { onRetry: () => void }): JSX.Element {
  return (
    <div class="flex flex-col items-center gap-3 py-8">
      <p class="text-body text-center text-token-text-secondary">{LIST_FETCH_ERROR_COPY}</p>
      <button
        type="button"
        onClick={() => props.onRetry()}
        class="text-body-strong text-token-accent-default cursor-pointer bg-transparent border-0 px-3 py-1 rounded-sm focus-visible:outline-2 focus-visible:outline-token-accent-default focus-visible:outline-offset-2"
      >
        Retry
      </button>
    </div>
  );
}
