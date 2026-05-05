import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { LIVE_REGION_DRAIN_INTERVAL_MS, LIVE_REGION_HISTORY_MAX } from "../constants";

// Mount-aware queue: announcements are buffered until <LiveRegion /> mounts
// (HMR / SSR / pre-mount calls) and synchronous announce() bursts are
// serialized through a microtask + setMessage("") + setMessage(next) cycle so
// screen readers register each transition. The 120 ms inter-message delay is
// short enough to feel concurrent to a sighted user but long enough that
// politely-live AT polling registers the change.
const queue: string[] = [];
const history: string[] = [];
// Refcount instead of boolean: HMR double-mount unmounts one instance without
// silencing the survivor.
let mountCount = 0;
let draining = false;
// Generation token: incremented by __resetLiveRegionForTests so stale
// microtasks and setTimeout callbacks from a previous test cannot write
// into the next test's signal or history.
let generation = 0;
const [message, setMessage] = createSignal("");

const drain = (gen: number): void => {
  if (gen !== generation || draining || mountCount === 0) return;
  const next = queue.shift();
  if (next === undefined) return;
  draining = true;
  setMessage("");
  queueMicrotask(() => {
    if (gen !== generation) return;
    setMessage(next);
    history.push(next);
    // Cap history growth — long-lived sessions would otherwise retain every
    // announcement string for the lifetime of the tab.
    if (history.length > LIVE_REGION_HISTORY_MAX) {
      history.splice(0, history.length - LIVE_REGION_HISTORY_MAX);
    }
    setTimeout(() => {
      if (gen !== generation) return;
      draining = false;
      drain(gen);
    }, LIVE_REGION_DRAIN_INTERVAL_MS);
  });
};

export const announce = (next: string): void => {
  queue.push(next);
  drain(generation);
};

export function LiveRegion(): JSX.Element {
  onMount(() => {
    mountCount += 1;
    drain(generation);
  });
  onCleanup(() => {
    mountCount = Math.max(0, mountCount - 1);
  });
  return (
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {message()}
    </div>
  );
}

export const __resetLiveRegionForTests = (): void => {
  generation += 1;
  queue.length = 0;
  history.length = 0;
  mountCount = 0;
  draining = false;
  setMessage("");
};

export const __getLiveRegionMessageForTests = (): string => message();

export const __getLiveRegionHistoryForTests = (): readonly string[] => history;
