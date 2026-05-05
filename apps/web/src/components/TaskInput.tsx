import { createSignal, onMount, Show, type JSX } from "solid-js";
import { CHARACTER_COUNTER_THRESHOLD, MAX_TASK_LENGTH } from "../constants";
import "./TaskInput.css";

interface TaskInputProps {
  onSubmit: (text: string) => void;
}

export function TaskInput(props: TaskInputProps): JSX.Element {
  const [value, setValue] = createSignal("");
  let inputRef: HTMLInputElement | undefined;
  const captureInputRef = (element: HTMLInputElement): void => {
    inputRef = element;
  };

  onMount(() => {
    inputRef?.focus();
  });

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      if (event.shiftKey) return;
      const trimmed = value().trim();
      if (trimmed === "") return;
      props.onSubmit(trimmed);
      setValue("");
      return;
    }
    if (event.key === "Escape" && value() !== "") {
      setValue("");
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const firstRow = document.querySelector("[data-task-id]") as HTMLElement | null;
      firstRow?.focus();
    }
  };

  return (
    <div class="task-input-wrapper">
      <input
        ref={captureInputRef}
        type="text"
        class="task-input"
        value={value()}
        onInput={(event) => setValue(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        aria-label="New task"
        placeholder="What needs doing?"
        maxlength={MAX_TASK_LENGTH}
        autocomplete="off"
        autocapitalize="sentences"
        spellcheck={true}
      />
      <Show when={value().length >= CHARACTER_COUNTER_THRESHOLD}>
        <CharacterCounter count={value().length} />
      </Show>
    </div>
  );
}

function CharacterCounter(props: { count: number }): JSX.Element {
  return (
    <div class="task-input-counter" aria-live="polite">
      {props.count} / {MAX_TASK_LENGTH}
    </div>
  );
}
