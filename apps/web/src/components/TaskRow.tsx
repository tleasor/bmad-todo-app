import type { JSX } from "solid-js";
import type { Task } from "../data/api";

interface TaskRowProps {
  task: Task;
}

export function TaskRow(props: TaskRowProps): JSX.Element {
  return (
    <li
      tabindex="0"
      class="task-row flex items-center gap-3 py-3 px-4 min-[900px]:px-2 hover:bg-token-bg-subtle"
    >
      <Checkbox />
      <span class="task-row__text">{props.task.text}</span>
      <DeleteButton />
    </li>
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
