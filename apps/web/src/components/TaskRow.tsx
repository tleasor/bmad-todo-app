import { Show, type JSX } from "solid-js";
import type { Task } from "../data/api";
import { LIVE_REGION_RETRY_EXHAUSTED } from "../data/announcements";
import { useCaptureSyncStatus } from "../data/captureSyncStore";
import "./TaskRow.css";

interface TaskRowProps {
  task: Task;
}

export function TaskRow(props: TaskRowProps): JSX.Element {
  const sync = useCaptureSyncStatus(() => props.task.id);
  return (
    <li
      tabindex="0"
      class="task-row flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle"
      classList={{ "task-row--retry-exhausted": sync()?.status === "exhausted" }}
    >
      <div class="task-row__primary">
        <Checkbox />
        <span class="task-row__text">{props.task.text}</span>
        <Show when={sync()?.status === "pending"}>
          <SyncIndicator />
        </Show>
        <Show when={sync()?.status === "exhausted"}>
          <RetryAction onRetry={sync()?.retry ?? noop} />
        </Show>
        <DeleteButton />
      </div>
      <Show when={sync()?.status === "exhausted"}>
        <ErrorMessage />
      </Show>
    </li>
  );
}

const noop = (): void => undefined;

function SyncIndicator(): JSX.Element {
  return <span aria-label="Saving" class="task-row__sync-indicator" />;
}

function ErrorMessage(): JSX.Element {
  return <p class="task-row__error-message">{LIVE_REGION_RETRY_EXHAUSTED}</p>;
}

function RetryAction(props: { onRetry: () => void }): JSX.Element {
  return (
    <button type="button" class="task-row__retry-action" onClick={() => props.onRetry()}>
      Retry
    </button>
  );
}

function Checkbox(): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked="false"
      aria-label="Mark task as complete"
      class="task-row__checkbox shrink-0 w-5 h-5 rounded-full border-2 border-token-border-strong bg-transparent"
    />
  );
}

function DeleteButton(): JSX.Element {
  return (
    <button
      type="button"
      aria-label="Delete task"
      class="task-row__delete shrink-0 inline-flex items-center justify-center"
    >
      <TrashIcon />
    </button>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
