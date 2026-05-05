import { For, type JSX } from "solid-js";
import "./LoadingState.css";

const SKELETON_VARIANTS = ["mid", "default", "short"] as const;

type SkeletonVariant = (typeof SKELETON_VARIANTS)[number];

export function LoadingState(): JSX.Element {
  return (
    <div class="loading-list" aria-busy="true" aria-live="polite">
      <For each={SKELETON_VARIANTS}>{(variant) => <SkeletonRow variant={variant} />}</For>
    </div>
  );
}

function SkeletonRow(props: { variant: SkeletonVariant }): JSX.Element {
  return (
    <div class="skeleton-row" aria-hidden="true" data-testid="skeleton-row">
      <span class="skeleton-circle" />
      <span
        class="skeleton-text"
        classList={{
          "skeleton-text--mid": props.variant === "mid",
          "skeleton-text--short": props.variant === "short",
        }}
      />
    </div>
  );
}
