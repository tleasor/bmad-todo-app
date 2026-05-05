import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import type { Task } from "../data/api";
import { __captureSyncMutators, __resetCaptureSyncStoreForTests } from "../data/captureSyncStore";
import { TaskRow } from "./TaskRow";

beforeEach(() => {
  __resetCaptureSyncStoreForTests();
});

afterEach(() => {
  cleanup();
  __resetCaptureSyncStoreForTests();
});

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: "0193f000-0000-7000-8000-000000000000",
  text: "buy milk",
  completed: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

const renderRow = (task: Task): ReturnType<typeof render> =>
  render(() => (
    <ul>
      <TaskRow task={task} />
    </ul>
  ));

const assertNoEventHandlerAttributes = (root: HTMLElement): void => {
  const all: Element[] = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.startsWith("on")).toBe(false);
    }
  }
};

describe("TaskRow", () => {
  it("renders <li tabindex=0> with checkbox, text, and delete button", () => {
    const { getByRole, getByLabelText, getByText } = renderRow(baseTask());
    const items = document.querySelectorAll("li");
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute("tabindex")).toBe("0");

    const checkbox = getByRole("checkbox");
    expect(checkbox.tagName).toBe("BUTTON");
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(checkbox.getAttribute("aria-label")).toBe("Mark task as complete");

    expect(getByLabelText("Delete task").tagName).toBe("BUTTON");
    expect(getByText("buy milk")).toBeDefined();
  });

  it("does not throw or remove the row when the delete button is clicked (no mutation wired)", () => {
    const { getByLabelText } = renderRow(baseTask({ text: "still here" }));
    fireEvent.click(getByLabelText("Delete task"));
    const items = document.querySelectorAll("li");
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain("still here");
  });

  it("does not throw or change aria-checked when the checkbox is clicked (no mutation wired)", () => {
    const { getByRole } = renderRow(baseTask());
    const checkbox = getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
  });

  it("renders a <script> payload as literal text rather than a DOM element", () => {
    const malicious = "<script>alert(1)</script>";
    const { container, getByText } = renderRow(baseTask({ text: malicious }));
    expect(getByText(malicious, { exact: true })).toBeDefined();
    expect(container.querySelector("script")).toBeNull();
    assertNoEventHandlerAttributes(container);
  });

  it("renders an <img onerror=...> payload as literal text rather than a DOM element", () => {
    const malicious = "<img src=x onerror=alert(1)>";
    const { container, getByText } = renderRow(baseTask({ text: malicious }));
    expect(getByText(malicious, { exact: true })).toBeDefined();
    expect(container.querySelectorAll("img").length).toBe(0);
    assertNoEventHandlerAttributes(container);
  });

  it("applies the task-row__text class so the two-line clamp recipe stays attached", () => {
    const { container } = renderRow(baseTask());
    const textNode = container.querySelector(".task-row__text");
    expect(textNode).not.toBeNull();
    expect(textNode?.textContent).toBe("buy milk");
  });
});

describe("TaskRow sync states", () => {
  it("renders no SyncIndicator, ErrorMessage, or RetryAction when no captureSyncStore entry exists", () => {
    const { container, queryByLabelText, queryByText, queryByRole } = renderRow(baseTask());
    expect(queryByLabelText("Saving")).toBeNull();
    expect(queryByText("Couldn't save — check connection.")).toBeNull();
    expect(queryByRole("button", { name: "Retry" })).toBeNull();
    expect(container.querySelector(".task-row--retry-exhausted")).toBeNull();
  });

  it("renders SyncIndicator with aria-label='Saving' when status is pending", () => {
    const task = baseTask({ id: "task-pending" });
    __captureSyncMutators.markPending(task.id, () => undefined);
    const { container, getByLabelText, queryByText, queryByRole } = renderRow(task);

    const indicator = getByLabelText("Saving");
    expect(indicator.tagName).toBe("SPAN");
    expect(indicator.classList.contains("task-row__sync-indicator")).toBe(true);
    expect(queryByText("Couldn't save — check connection.")).toBeNull();
    expect(queryByRole("button", { name: "Retry" })).toBeNull();
    expect(container.querySelector(".task-row--retry-exhausted")).toBeNull();
  });

  it("renders ErrorMessage and RetryAction when status is exhausted; DeleteButton remains", () => {
    const task = baseTask({ id: "task-exhausted" });
    const retryMock = mock(() => undefined);
    __captureSyncMutators.markExhausted(task.id, retryMock);
    const { container, getByText, getByRole, getByLabelText, queryByLabelText } = renderRow(task);

    expect(getByText("Couldn't save — check connection.")).toBeDefined();
    const retryButton = getByRole("button", { name: "Retry" });
    expect(retryButton.tagName).toBe("BUTTON");
    expect(retryButton.getAttribute("type")).toBe("button");
    expect(getByLabelText("Delete task")).toBeDefined();
    expect(queryByLabelText("Saving")).toBeNull();
    expect(container.querySelector(".task-row--retry-exhausted")).not.toBeNull();
  });

  it("invokes the entry's retry callback when RetryAction is clicked", () => {
    const task = baseTask({ id: "task-click" });
    const retryMock = mock(() => undefined);
    __captureSyncMutators.markExhausted(task.id, retryMock);
    const { getByRole } = renderRow(task);

    fireEvent.click(getByRole("button", { name: "Retry" }));
    expect(retryMock.mock.calls).toHaveLength(1);
  });

  it("RetryAction is a real <button type=button> so native keyboard semantics apply", () => {
    const task = baseTask({ id: "task-kbd" });
    __captureSyncMutators.markExhausted(task.id, () => undefined);
    const { getByRole } = renderRow(task);

    const retryButton = getByRole("button", { name: "Retry" });
    expect(retryButton.tagName).toBe("BUTTON");
    expect(retryButton.getAttribute("type")).toBe("button");
  });

  it("retry-exhausted state preserves XSS-safe rendering of the task text", () => {
    const malicious = "<script>alert(1)</script>";
    const task = baseTask({ id: "task-xss-exhausted", text: malicious });
    __captureSyncMutators.markExhausted(task.id, () => undefined);
    const { container, getByText } = renderRow(task);

    expect(getByText(malicious, { exact: true })).toBeDefined();
    expect(container.querySelector("script")).toBeNull();
    assertNoEventHandlerAttributes(container);
  });

  it("retry-exhausted state preserves XSS-safe rendering of <img onerror=...> payloads", () => {
    const malicious = "<img src=x onerror=alert(1)>";
    const task = baseTask({ id: "task-xss-img-exhausted", text: malicious });
    __captureSyncMutators.markExhausted(task.id, () => undefined);
    const { container, getByText } = renderRow(task);

    expect(getByText(malicious, { exact: true })).toBeDefined();
    expect(container.querySelectorAll("img").length).toBe(0);
    assertNoEventHandlerAttributes(container);
  });
});

describe("TaskRow.css contract", () => {
  const cssPath = join(import.meta.dir, "TaskRow.css");
  const css = readFileSync(cssPath, "utf8");

  it("defines the spinning sync-indicator keyframes and class", () => {
    expect(css).toContain(".task-row__sync-indicator");
    expect(css).toContain("@keyframes task-row__sync-spin");
    expect(css).toContain("animation: task-row__sync-spin 1500ms linear infinite");
  });

  it("suppresses the rotation under prefers-reduced-motion: reduce", () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.task-row__sync-indicator\s*\{[^}]*animation:\s*none/,
    );
  });

  it("uses the status-pending token (not warning amber) for the dashed circle", () => {
    expect(css).toContain("border: 2px dashed var(--color-status-pending)");
  });

  it("uses the status-error-subtle token for the retry-exhausted row background", () => {
    expect(css).toContain(".task-row--retry-exhausted");
    expect(css).toContain("background: var(--color-status-error-subtle)");
  });
});
