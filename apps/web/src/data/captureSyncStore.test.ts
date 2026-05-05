import { afterEach, describe, expect, it } from "bun:test";
import {
  __captureSyncMutators,
  __captureSyncStorePeek,
  __resetCaptureSyncStoreForTests,
  useCaptureSyncStatus,
} from "./captureSyncStore";

afterEach(() => {
  __resetCaptureSyncStoreForTests();
});

describe("captureSyncStore", () => {
  it("returns undefined for an unknown id", () => {
    expect(__captureSyncStorePeek("missing")).toBeUndefined();
  });

  it("markPending stores a pending entry with the retry callback", () => {
    const retry = (): void => undefined;
    __captureSyncMutators.markPending("a", retry);
    const entry = __captureSyncStorePeek("a");
    expect(entry?.status).toBe("pending");
    expect(entry?.retry).toBe(retry);
  });

  it("markExhausted stores an exhausted entry with the retry callback", () => {
    const retry = (): void => undefined;
    __captureSyncMutators.markExhausted("b", retry);
    const entry = __captureSyncStorePeek("b");
    expect(entry?.status).toBe("exhausted");
    expect(entry?.retry).toBe(retry);
  });

  it("clear removes the entry", () => {
    __captureSyncMutators.markPending("c", () => undefined);
    __captureSyncMutators.clear("c");
    expect(__captureSyncStorePeek("c")).toBeUndefined();
  });

  it("__resetCaptureSyncStoreForTests clears all entries", () => {
    __captureSyncMutators.markPending("d", () => undefined);
    __captureSyncMutators.markExhausted("e", () => undefined);
    __resetCaptureSyncStoreForTests();
    expect(__captureSyncStorePeek("d")).toBeUndefined();
    expect(__captureSyncStorePeek("e")).toBeUndefined();
  });

  it("useCaptureSyncStatus accessor reads the entry by reactive id", () => {
    const accessor = useCaptureSyncStatus(() => "f");
    expect(accessor()).toBeUndefined();
    __captureSyncMutators.markPending("f", () => undefined);
    expect(accessor()?.status).toBe("pending");
  });
});
