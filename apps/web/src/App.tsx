import type { JSX } from "solid-js";

export function App(): JSX.Element {
  const focusOnMount = (el: HTMLInputElement): void => {
    queueMicrotask(() => el.focus());
  };
  return (
    <main>
      <h1>bmad-todo-app</h1>
      <label>
        New task
        <input ref={focusOnMount} type="text" autofocus aria-label="New task" />
      </label>
    </main>
  );
}
