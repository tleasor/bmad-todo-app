import type { JSX } from "solid-js";

export function EmptyState(): JSX.Element {
  return (
    <p class="text-body text-center text-token-text-secondary">
      No tasks yet. Start by typing above.
    </p>
  );
}
