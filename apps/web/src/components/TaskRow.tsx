import { createSignal, onCleanup, Show, type JSX } from "solid-js";
import type { Task } from "../data/api";
import { LIVE_REGION_RETRY_EXHAUSTED } from "../data/announcements";
import { useCaptureSyncStatus, type CaptureSyncEntry } from "../data/captureSyncStore";
import { useToggleSyncStatus, type ToggleSyncEntry } from "../data/toggleSyncStore";
import { clearTogglePendingTimerForTask, useDeleteTask, useToggleTask } from "../data/queries";
import "./TaskRow.css";

interface TaskRowProps {
  task: Task;
}

export function TaskRow(props: TaskRowProps): JSX.Element {
  const captureSync = useCaptureSyncStatus(() => props.task.id);
  const toggleSync = useToggleSyncStatus(() => props.task.id);
  const sync = (): CaptureSyncEntry | ToggleSyncEntry | undefined => toggleSync() ?? captureSync();
  const toggleMutation = useToggleTask();
  const deleteMutation = useDeleteTask();
  const [isLeaving, setIsLeaving] = createSignal(false);

  onCleanup(() => clearTogglePendingTimerForTask(props.task.id));

  const handleRowKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    if (event.key === " " && event.target === event.currentTarget) {
      event.preventDefault();
      if (toggleMutation.isPending) return;
      toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed });
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      event.target === event.currentTarget
    ) {
      event.preventDefault();
      handleDelete();
    }
    if ((event.key === "ArrowDown" || event.key === "j") && event.target === event.currentTarget) {
      event.preventDefault();
      const allRows = Array.from(
        document.querySelectorAll("[data-task-id]:not(.task-row--leaving)"),
      ) as HTMLElement[];
      const idx = allRows.findIndex((el) => el.dataset.taskId === props.task.id);
      if (idx === -1) return;
      allRows[idx + 1]?.focus();
    }
    if ((event.key === "ArrowUp" || event.key === "k") && event.target === event.currentTarget) {
      event.preventDefault();
      const allRows = Array.from(
        document.querySelectorAll("[data-task-id]:not(.task-row--leaving)"),
      ) as HTMLElement[];
      const idx = allRows.findIndex((el) => el.dataset.taskId === props.task.id);
      if (idx === -1) return;
      if (idx === 0) {
        (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
      } else {
        allRows[idx - 1]?.focus();
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
    }
    if (event.key === "i" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
    }
    if (
      event.key.length === 1 &&
      event.key !== " " &&
      event.key !== "i" &&
      event.key !== "j" &&
      event.key !== "k" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const taskInput = document.querySelector(
        '[aria-label="New task"]',
      ) as HTMLInputElement | null;
      if (taskInput) {
        taskInput.value = taskInput.value + event.key;
        taskInput.dispatchEvent(new Event("input", { bubbles: true }));
        taskInput.focus();
      }
    }
  };

  const handleDelete = (): void => {
    const allRows = Array.from(document.querySelectorAll("[data-task-id]")) as HTMLElement[];
    const idx = allRows.findIndex((el) => el.dataset.taskId === props.task.id);
    const focusTarget = allRows[idx + 1] ?? allRows[idx - 1] ?? null;
    if (focusTarget) {
      focusTarget.focus();
    } else {
      (document.querySelector('[aria-label="New task"]') as HTMLElement | null)?.focus();
    }
    setIsLeaving(true);
  };

  return (
    <li
      tabindex="0"
      data-task-id={props.task.id}
      onKeyDown={handleRowKeyDown}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on:animationend={(e) => {
        if (isLeaving() && (e as AnimationEvent).animationName === "task-row-leave")
          deleteMutation.mutate(props.task.id);
      }}
      class="task-row flex flex-col py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle"
      classList={{
        "task-row--retry-exhausted": sync()?.status === "exhausted",
        "task-row--completed": props.task.completed,
        "task-row--leaving": isLeaving(),
      }}
    >
      <div class="task-row__primary">
        <Checkbox
          checked={props.task.completed}
          disabled={toggleMutation.isPending}
          onToggle={() =>
            toggleMutation.mutate({ id: props.task.id, completed: !props.task.completed })
          }
        />
        <span class="task-row__text">{props.task.text}</span>
        <Show when={sync()?.status === "pending"}>
          <SyncIndicator />
        </Show>
        <Show when={sync()?.status === "exhausted"}>
          <RetryAction onRetry={sync()?.retry ?? noop} />
        </Show>
        <DeleteButton onDelete={handleDelete} />
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

interface CheckboxProps {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function Checkbox(props: CheckboxProps): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-label={props.checked ? "Mark task as incomplete" : "Mark task as complete"}
      disabled={props.disabled}
      class="task-row__checkbox shrink-0 w-5 h-5 rounded-full border-2 border-token-border-strong bg-transparent"
      classList={{ "task-row__checkbox--completed": props.checked }}
      onClick={() => props.onToggle()}
    >
      <Show when={props.checked}>
        <CheckmarkIcon />
      </Show>
    </button>
  );
}

function CheckmarkIcon(): JSX.Element {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
      <path
        d="M1 4L3.5 6.5L9 1"
        stroke="white"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function DeleteButton(props: { onDelete: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-label="Delete task"
      class="task-row__delete shrink-0 inline-flex items-center justify-center"
      onClick={props.onDelete}
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
