import { createSignal, type JSX } from "solid-js";

const [message, setMessage] = createSignal("");

export const announce = (nextMessage: string): void => {
  setMessage("");
  queueMicrotask(() => setMessage(nextMessage));
};

export function LiveRegion(): JSX.Element {
  return (
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {message()}
    </div>
  );
}

export const __resetLiveRegionForTests = (): void => {
  setMessage("");
};

export const __getLiveRegionMessageForTests = (): string => message();
