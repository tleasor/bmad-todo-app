import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@solidjs/testing-library";
import { LIVE_REGION_DRAIN_INTERVAL_MS } from "../constants";
import {
  __getLiveRegionHistoryForTests,
  __getLiveRegionMessageForTests,
  __resetLiveRegionForTests,
  announce,
  LiveRegion,
} from "./LiveRegion";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const flushDrain = async (): Promise<void> => {
  // The drain pumps microtask + LIVE_REGION_DRAIN_INTERVAL_MS between messages.
  // Yield repeatedly to let the queue fully flush.
  for (let i = 0; i < 8; i++) {
    await wait(LIVE_REGION_DRAIN_INTERVAL_MS + 5);
  }
};

beforeEach(() => {
  __resetLiveRegionForTests();
});

afterEach(() => {
  cleanup();
  __resetLiveRegionForTests();
});

describe("LiveRegion", () => {
  it("renders a single polite atomic visually-hidden live region", () => {
    const { container } = render(() => <LiveRegion />);
    const region = container.querySelector("div");
    expect(region?.getAttribute("class")).toBe("sr-only");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.getAttribute("aria-atomic")).toBe("true");
  });

  it("drains a single announcement and records it in history", async () => {
    render(() => <LiveRegion />);
    announce("hello");
    await flushDrain();
    expect(__getLiveRegionHistoryForTests()).toEqual(["hello"]);
    expect(__getLiveRegionMessageForTests()).toBe("hello");
  });

  it("delivers two synchronous announcements in order without collapsing", async () => {
    render(() => <LiveRegion />);
    announce("first");
    announce("second");
    await flushDrain();
    expect(__getLiveRegionHistoryForTests()).toEqual(["first", "second"]);
  });

  it("queues announcements made before the region mounts and drains on mount", async () => {
    announce("pre-mount");
    expect(__getLiveRegionHistoryForTests()).toEqual([]);
    render(() => <LiveRegion />);
    await flushDrain();
    expect(__getLiveRegionHistoryForTests()).toEqual(["pre-mount"]);
  });

  it("__resetLiveRegionForTests clears queue, history, and message state", async () => {
    render(() => <LiveRegion />);
    announce("a");
    await flushDrain();
    expect(__getLiveRegionHistoryForTests().length).toBeGreaterThan(0);
    __resetLiveRegionForTests();
    expect(__getLiveRegionHistoryForTests()).toEqual([]);
    expect(__getLiveRegionMessageForTests()).toBe("");
  });
});
