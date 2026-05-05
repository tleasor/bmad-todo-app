import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { logger } from "./log";

type Captured = string[];

let original: typeof process.stdout.write;
let captured: Captured;

const installCapture = (): void => {
  captured = [];
  original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    captured.push(text);
    return true;
  }) as typeof process.stdout.write;
};

const restoreCapture = (): void => {
  process.stdout.write = original;
};

const lastLineAsJson = <T = Record<string, unknown>>(): T => {
  const text = captured.join("");
  const lines = text.split("\n").filter((l) => l.length > 0);
  const last = lines.at(-1);
  if (last === undefined) throw new Error("no log line captured");
  return JSON.parse(last) as T;
};

describe("logger", () => {
  beforeEach(() => {
    installCapture();
  });
  afterEach(() => {
    restoreCapture();
  });

  it("info emits one JSON line ending in newline with level/msg/ts", () => {
    logger.info("hello");
    const text = captured.join("");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n").filter((l) => l.length > 0)).toHaveLength(1);
    const parsed = lastLineAsJson<{ level: string; msg: string; ts: number }>();
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(typeof parsed.ts).toBe("number");
    expect(parsed.ts).toBeGreaterThan(0);
  });

  it("warn emits level=warn", () => {
    logger.warn("careful");
    expect(lastLineAsJson<{ level: string }>().level).toBe("warn");
  });

  it("error emits level=error", () => {
    logger.error("boom");
    expect(lastLineAsJson<{ level: string }>().level).toBe("error");
  });

  it("merges caller-supplied fields into the line", () => {
    logger.info("x", { requestId: "abc", method: "GET", path: "/y", status: 200 });
    const parsed = lastLineAsJson<{
      requestId: string;
      method: string;
      path: string;
      status: number;
    }>();
    expect(parsed.requestId).toBe("abc");
    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/y");
    expect(parsed.status).toBe(200);
  });

  it("strips undefined fields", () => {
    logger.info("x", { keep: 1, drop: undefined });
    const parsed = lastLineAsJson<{ keep: number; drop?: unknown }>();
    expect(parsed.keep).toBe(1);
    expect(Object.hasOwn(parsed, "drop")).toBe(false);
  });

  it("serializes Error instances with name/message/stack", () => {
    const err = new Error("kapow");
    logger.error("crash", { err });
    const parsed = lastLineAsJson<{
      err: { name: string; message: string; stack?: string };
    }>();
    expect(parsed.err.name).toBe("Error");
    expect(parsed.err.message).toBe("kapow");
    expect(typeof parsed.err.stack === "string" || parsed.err.stack === undefined).toBe(true);
  });

  it("does not allow caller to override level/msg/ts", () => {
    logger.info("real", {
      level: "error",
      msg: "spoofed",
      ts: 0,
    } as unknown as Record<string, unknown>);
    const parsed = lastLineAsJson<{ level: string; msg: string; ts: number }>();
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("real");
    expect(parsed.ts).toBeGreaterThan(0);
  });
});
