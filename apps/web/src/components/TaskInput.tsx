import { createSignal, onMount, Show, type JSX } from "solid-js";
import { CHARACTER_COUNTER_THRESHOLD, MAX_TASK_LENGTH } from "../constants";

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
  };

  return (
    <div class="block w-full">
      <input
        ref={captureInputRef}
        type="text"
        class="task-input block w-full h-12 py-3 px-4 rounded-sm bg-token-bg-surface text-token-text-primary border border-token-border-default hover:border-token-border-strong focus-visible:border-token-border-strong"
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
    <div class="text-caption text-token-text-secondary text-right mt-2" aria-live="polite">
      {props.count} / {MAX_TASK_LENGTH}
    </div>
  );
}
