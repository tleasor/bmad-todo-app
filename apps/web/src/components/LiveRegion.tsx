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
let mounted = false;
let draining = false;
const [message, setMessage] = createSignal("");

const drain = (): void => {
  if (draining || !mounted) return;
  const next = queue.shift();
  if (next === undefined) return;
  draining = true;
  setMessage("");
  queueMicrotask(() => {
    setMessage(next);
    history.push(next);
    // Cap history growth — long-lived sessions would otherwise retain every
    // announcement string for the lifetime of the tab.
    if (history.length > LIVE_REGION_HISTORY_MAX) {
      history.splice(0, history.length - LIVE_REGION_HISTORY_MAX);
    }
    setTimeout(() => {
      draining = false;
      drain();
    }, LIVE_REGION_DRAIN_INTERVAL_MS);
  });
};

export const announce = (next: string): void => {
  queue.push(next);
  drain();
};

export function LiveRegion(): JSX.Element {
  onMount(() => {
    mounted = true;
    drain();
  });
  onCleanup(() => {
    mounted = false;
  });
  return (
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {message()}
    </div>
  );
}

export const __resetLiveRegionForTests = (): void => {
  queue.length = 0;
  history.length = 0;
  mounted = false;
  draining = false;
  setMessage("");
};

export const __getLiveRegionMessageForTests = (): string => message();

export const __getLiveRegionHistoryForTests = (): readonly string[] => history;
