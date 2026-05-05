import type { JSX } from "solid-js";
import "./EmptyState.css";

export function EmptyState(): JSX.Element {
  return <div class="empty-state">No tasks yet. Start by typing above.</div>;
}
