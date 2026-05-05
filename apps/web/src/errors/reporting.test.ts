import { describe, expect, it } from "bun:test";
import { __resetGlobalErrorHandlersForTests, registerGlobalErrorHandlers } from "./reporting";

type FakeEvent = { error?: unknown; message?: string; reason?: unknown };

const createTarget = (): {
  listeners: Map<string, Set<EventListener>>;
  fire: (type: string, event: FakeEvent) => void;
  target: Pick<Window, "addEventListener" | "removeEventListener">;
} => {
  const listeners = new Map<string, Set<EventListener>>();
  const target: Pick<Window, "addEventListener" | "removeEventListener"> = {
    addEventListener: ((type: string, listener: EventListenerOrEventListenerObject) => {
      const bucket = listeners.get(type) ?? new Set<EventListener>();
      bucket.add(listener as EventListener);
      listeners.set(type, bucket);
    }) as Window["addEventListener"],
    removeEventListener: ((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener as EventListener);
    }) as Window["removeEventListener"],
  };
  const fire = (type: string, event: FakeEvent): void => {
    for (const listener of listeners.get(type) ?? []) {
      listener(event as unknown as Event);
    }
  };
  return { listeners, fire, target };
};

describe("registerGlobalErrorHandlers", () => {
  it("logs structured JSON for window errors", () => {
    const { fire, target } = createTarget();
    const entries: string[] = [];
    registerGlobalErrorHandlers(target, (entry) => entries.push(entry));

    fire("error", { error: new Error("boom") });
    __resetGlobalErrorHandlersForTests(target);

    const parsed = JSON.parse(entries[0] ?? "{}") as {
      level: string;
      msg: string;
      ts: number;
      message: string;
    };
    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("window error");
    expect(typeof parsed.ts).toBe("number");
    expect(parsed.message).toBe("boom");
  });

  it("logs structured JSON for unhandled rejections", () => {
    const { fire, target } = createTarget();
    const entries: string[] = [];
    registerGlobalErrorHandlers(target, (entry) => entries.push(entry));

    fire("unhandledrejection", { reason: "network failed" });
    __resetGlobalErrorHandlersForTests(target);

    const parsed = JSON.parse(entries[0] ?? "{}") as { msg: string; message: string };
    expect(parsed.msg).toBe("unhandled rejection");
    expect(parsed.message).toBe("network failed");
  });

  it("registers handlers only once per target", () => {
    const { fire, target } = createTarget();
    const entries: string[] = [];
    registerGlobalErrorHandlers(target, (entry) => entries.push(entry));
    registerGlobalErrorHandlers(target, (entry) => entries.push(entry));

    fire("error", { message: "boom" });
    __resetGlobalErrorHandlersForTests(target);

    expect(entries.length).toBe(1);
  });

  it("removes listeners on reset so subsequent registrations do not duplicate", () => {
    const { listeners, fire, target } = createTarget();
    const entries: string[] = [];

    registerGlobalErrorHandlers(target, (entry) => entries.push(entry));
    __resetGlobalErrorHandlersForTests(target);
    registerGlobalErrorHandlers(target, (entry) => entries.push(entry));

    expect(listeners.get("error")?.size).toBe(1);
    expect(listeners.get("unhandledrejection")?.size).toBe(1);

    fire("error", { error: new Error("boom") });
    __resetGlobalErrorHandlersForTests(target);

    expect(entries.length).toBe(1);
  });

  it("falls back to a stable label when an error event has no error or message", () => {
    const { fire, target } = createTarget();
    const entries: string[] = [];
    registerGlobalErrorHandlers(target, (entry) => entries.push(entry));

    fire("error", {});
    __resetGlobalErrorHandlersForTests(target);

    const parsed = JSON.parse(entries[0] ?? "{}") as { message: string };
    expect(parsed.message).toBe("unknown error");
  });
});
