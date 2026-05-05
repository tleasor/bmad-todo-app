import { afterEach, describe, expect, it } from "bun:test";
import { __resetUuidV7ForTests, createUuidV7 } from "./uuid";

const originalDateNow = Date.now;
const originalGetRandomValues = crypto.getRandomValues.bind(crypto);

const stubClock = (now: number): void => {
  Date.now = () => now;
};

const stubRandom = (value: number): void => {
  crypto.getRandomValues = ((array: Uint8Array) => {
    array.fill(value);
    return array;
  }) as Crypto["getRandomValues"];
};

describe("createUuidV7", () => {
  afterEach(() => {
    Date.now = originalDateNow;
    crypto.getRandomValues = originalGetRandomValues;
    __resetUuidV7ForTests();
  });

  it("sorts lexicographically by creation time", () => {
    stubRandom(0);
    stubClock(1_000);
    const first = createUuidV7();
    stubClock(2_000);
    const second = createUuidV7();

    expect(first < second).toBe(true);
  });

  it("stays monotonic within a single millisecond", () => {
    stubRandom(0);
    stubClock(1_000);

    const ids = [createUuidV7(), createUuidV7(), createUuidV7()];

    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sets version 7 and RFC variant bits", () => {
    stubRandom(0);
    stubClock(1_000);

    const id = createUuidV7();

    expect(id[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });
});
