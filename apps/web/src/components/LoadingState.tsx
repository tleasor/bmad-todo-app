import { For, type JSX } from "solid-js";

const SKELETON_WIDTHS = ["100%", "75%", "60%"] as const;

type SkeletonWidth = (typeof SKELETON_WIDTHS)[number];

export function LoadingState(): JSX.Element {
  return (
    <div class="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <For each={SKELETON_WIDTHS}>{(width) => <SkeletonRow width={width} />}</For>
    </div>
  );
}

function SkeletonRow(props: { width: SkeletonWidth }): JSX.Element {
  return (
    <div class="flex items-center gap-3 py-3 px-4" aria-hidden="true" data-testid="skeleton-row">
      <div class="skeleton-shimmer w-5 h-5 rounded-full bg-token-bg-subtle shrink-0" />
      <div
        class="skeleton-shimmer h-4 rounded-sm bg-token-bg-subtle"
        style={{ width: props.width }}
      />
    </div>
  );
}
