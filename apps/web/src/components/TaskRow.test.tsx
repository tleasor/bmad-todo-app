import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import type { Task, TasksDeleteResponse, TasksPatchBody, TasksPatchResponse } from "../data/api";
import { _tasksApiSeams } from "../data/api";
import { __captureSyncMutators, __resetCaptureSyncStoreForTests } from "../data/captureSyncStore";
import { __resetFirstDeleteAnnouncementForTests } from "../data/queries";
import { __resetToggleSyncStoreForTests, __toggleSyncMutators } from "../data/toggleSyncStore";
import { TaskRow } from "./TaskRow";

const noRetryClient = (): QueryClient =>
  new QueryClient({ defaultOptions: { mutations: { retry: false } } });

beforeEach(() => {
  __resetCaptureSyncStoreForTests();
  __resetToggleSyncStoreForTests();
});

afterEach(() => {
  cleanup();
  __resetCaptureSyncStoreForTests();
  __resetToggleSyncStoreForTests();
  __resetFirstDeleteAnnouncementForTests();
});

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: "0193f000-0000-7000-8000-000000000000",
  text: "buy milk",
  completed: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...overrides,
});

// All TaskRow renders need QueryClientProvider because useToggleTask calls useMutation.
const renderRow = (task: Task): ReturnType<typeof render> => {
  const client = noRetryClient();
  return render(() => (
    <QueryClientProvider client={client}>
      <ul>
        <TaskRow task={task} />
      </ul>
    </QueryClientProvider>
  ));
};

// renderRowWithClient also mocks patchFetch so clicking the checkbox doesn't fire network.
const originalPatchFetch = _tasksApiSeams.patchFetch;
const renderRowWithClient = (task: Task): ReturnType<typeof render> => {
  _tasksApiSeams.patchFetch = mock(
    (): Promise<TasksPatchResponse> => new Promise<TasksPatchResponse>(() => undefined),
  );
  return renderRow(task);
};

const originalDeleteFetch = _tasksApiSeams.deleteFetch;
const renderRowWithDeleteClient = (task: Task): ReturnType<typeof render> => {
  _tasksApiSeams.deleteFetch = mock(
    (_id: string): Promise<TasksDeleteResponse> =>
      new Promise<TasksDeleteResponse>(() => undefined),
  );
  return renderRow(task);
};

afterEach(() => {
  _tasksApiSeams.patchFetch = originalPatchFetch;
  _tasksApiSeams.deleteFetch = originalDeleteFetch;
});

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

  it("clicking DeleteButton applies task-row--leaving class before animationend", () => {
    const { getByLabelText, container } = renderRowWithDeleteClient(
      baseTask({ text: "still here" }),
    );
    const li = container.querySelector("li")!;
    fireEvent.click(getByLabelText("Delete task"));
    expect(li.classList.contains("task-row--leaving")).toBe(true);
    // Row is still in the DOM — mutation hasn't fired yet (awaiting animationend)
    expect(document.querySelectorAll("li").length).toBe(1);
  });

  it("clicking DeleteButton calls deleteFetch with the task id after animationend", async () => {
    const deleteMock = mock(
      (_id: string): Promise<TasksDeleteResponse> =>
        new Promise<TasksDeleteResponse>(() => undefined),
    );
    _tasksApiSeams.deleteFetch = deleteMock;
    const task = baseTask();
    const { getByLabelText, container } = renderRow(task);
    const li = container.querySelector("li")!;
    fireEvent.click(getByLabelText("Delete task"));
    fireEvent.animationEnd(li, { animationName: "task-row-leave" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteMock.mock.calls).toHaveLength(1);
    expect(deleteMock.mock.calls[0]?.[0]).toBe(task.id);
  });

  it("data-task-id attribute matches task.id", () => {
    const task = baseTask();
    const { container } = renderRow(task);
    const li = container.querySelector("li")!;
    expect(li.dataset.taskId).toBe(task.id);
  });

  it("does not throw or change aria-checked when the checkbox is clicked (no mutation wired)", () => {
    const { getByRole } = renderRowWithClient(baseTask());
    const checkbox = getByRole("checkbox");
    fireEvent.click(checkbox);
    // aria-checked is driven by props.task.completed (static prop) — stays false immediately
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

describe("TaskRow completed state", () => {
  it("renders task text with line-through and muted color class when completed", () => {
    const { container, getByRole } = renderRow(baseTask({ completed: true }));
    const li = container.querySelector("li");
    expect(li?.classList.contains("task-row--completed")).toBe(true);
    const checkbox = getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
  });

  it("checkbox shows checkmark icon when completed", () => {
    const { getByRole } = renderRow(baseTask({ completed: true }));
    const checkbox = getByRole("checkbox");
    const svg = checkbox.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("checkbox aria-label describes the pending action based on completion state", () => {
    const { getByRole: getActive } = renderRow(baseTask({ completed: false }));
    expect(getActive("checkbox").getAttribute("aria-label")).toBe("Mark task as complete");

    cleanup();

    const { getByRole: getCompleted } = renderRow(baseTask({ completed: true }));
    expect(getCompleted("checkbox").getAttribute("aria-label")).toBe("Mark task as incomplete");
  });

  it("checkbox is disabled while a toggle mutation is in flight", () => {
    const { getByRole } = renderRowWithClient(baseTask());
    const checkbox = getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(checkbox.hasAttribute("disabled")).toBe(true);
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

  it("renders SyncIndicator when toggle sync is pending", () => {
    const task = baseTask({ id: "task-toggle-pending" });
    __toggleSyncMutators.markPending(task.id, () => undefined);
    const { getByLabelText, queryByText, queryByRole, container } = renderRow(task);

    expect(getByLabelText("Saving")).toBeDefined();
    expect(queryByText("Couldn't save — check connection.")).toBeNull();
    expect(queryByRole("button", { name: "Retry" })).toBeNull();
    expect(container.querySelector(".task-row--retry-exhausted")).toBeNull();
  });

  it("renders ErrorMessage and RetryAction when toggle sync is exhausted", () => {
    const task = baseTask({ id: "task-toggle-exhausted" });
    __toggleSyncMutators.markExhausted(task.id, () => undefined);
    const { getByText, getByRole, container } = renderRow(task);

    expect(getByText("Couldn't save — check connection.")).toBeDefined();
    expect(getByRole("button", { name: "Retry" })).toBeDefined();
    expect(container.querySelector(".task-row--retry-exhausted")).not.toBeNull();
  });

  it("compose: toggle sync takes priority over capture sync when both present", () => {
    const task = baseTask({ id: "task-compose" });
    __toggleSyncMutators.markPending(task.id, () => undefined);
    __captureSyncMutators.markExhausted(task.id, () => undefined);
    const { queryAllByLabelText } = renderRow(task);

    // Toggle is pending → should show Saving indicator, not exhausted state
    const indicators = queryAllByLabelText("Saving");
    expect(indicators).toHaveLength(1);
  });
});

describe("TaskRow keyboard Space handler", () => {
  it("Space on the <li> container calls patchFetch", async () => {
    const patchMock = mock(
      (_id: string, _body: TasksPatchBody): Promise<TasksPatchResponse> =>
        new Promise<TasksPatchResponse>(() => undefined),
    );
    _tasksApiSeams.patchFetch = patchMock;
    const { container } = renderRow(baseTask());
    const li = container.querySelector("li")!;
    fireEvent.keyDown(li, { key: " " });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(patchMock.mock.calls).toHaveLength(1);
    expect(patchMock.mock.calls[0]?.[0]).toBe("0193f000-0000-7000-8000-000000000000");
    expect(patchMock.mock.calls[0]?.[1]).toEqual({ completed: true });
  });

  it("Space on the Checkbox button does not invoke the row-level handler", async () => {
    const patchMock = mock(
      (_id: string, _body: TasksPatchBody): Promise<TasksPatchResponse> =>
        new Promise<TasksPatchResponse>(() => undefined),
    );
    _tasksApiSeams.patchFetch = patchMock;
    const { getByRole } = renderRow(baseTask());
    const checkbox = getByRole("checkbox");
    fireEvent.keyDown(checkbox, { key: " " });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(patchMock.mock.calls).toHaveLength(0);
  });

  it("Space on the <li> calls event.preventDefault", () => {
    const { container } = renderRowWithClient(baseTask());
    const li = container.querySelector("li")!;
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    const preventDefaultSpy = mock(() => undefined);
    Object.defineProperty(event, "preventDefault", { value: preventDefaultSpy });
    li.dispatchEvent(event);
    expect(preventDefaultSpy.mock.calls).toHaveLength(1);
  });
});

describe("TaskRow keyboard Delete/Backspace handler", () => {
  it("Delete on the <li> container applies task-row--leaving and calls deleteFetch after animationend", async () => {
    const deleteMock = mock(
      (_id: string): Promise<TasksDeleteResponse> =>
        new Promise<TasksDeleteResponse>(() => undefined),
    );
    _tasksApiSeams.deleteFetch = deleteMock;
    const { container } = renderRow(baseTask());
    const li = container.querySelector("li")!;
    fireEvent.keyDown(li, { key: "Delete" });
    expect(li.classList.contains("task-row--leaving")).toBe(true);
    fireEvent.animationEnd(li, { animationName: "task-row-leave" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteMock.mock.calls).toHaveLength(1);
    expect(deleteMock.mock.calls[0]?.[0]).toBe("0193f000-0000-7000-8000-000000000000");
  });

  it("Backspace on the <li> container applies task-row--leaving and calls deleteFetch after animationend", async () => {
    const deleteMock = mock(
      (_id: string): Promise<TasksDeleteResponse> =>
        new Promise<TasksDeleteResponse>(() => undefined),
    );
    _tasksApiSeams.deleteFetch = deleteMock;
    const { container } = renderRow(baseTask());
    const li = container.querySelector("li")!;
    fireEvent.keyDown(li, { key: "Backspace" });
    expect(li.classList.contains("task-row--leaving")).toBe(true);
    fireEvent.animationEnd(li, { animationName: "task-row-leave" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteMock.mock.calls).toHaveLength(1);
    expect(deleteMock.mock.calls[0]?.[0]).toBe("0193f000-0000-7000-8000-000000000000");
  });

  it("Delete on a child button does not trigger row-level delete", async () => {
    const deleteMock = mock(
      (_id: string): Promise<TasksDeleteResponse> =>
        new Promise<TasksDeleteResponse>(() => undefined),
    );
    _tasksApiSeams.deleteFetch = deleteMock;
    const { getByRole } = renderRow(baseTask());
    const checkbox = getByRole("checkbox");
    fireEvent.keyDown(checkbox, { key: "Delete" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteMock.mock.calls).toHaveLength(0);
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

  it("defines completed text treatment with line-through and muted color", () => {
    expect(css).toContain(".task-row--completed .task-row__text");
    expect(css).toContain("text-decoration: line-through");
    expect(css).toContain("color: var(--color-text-muted)");
  });

  it("defines checkbox completed state with accent fill", () => {
    expect(css).toContain(".task-row__checkbox--completed");
    expect(css).toContain("background: var(--color-accent-default)");
  });

  it("suppresses text transition under prefers-reduced-motion: reduce", () => {
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.task-row__text\s*\{[^}]*transition:\s*none/,
    );
  });

  it("scopes hover styles to hover-capable devices only", () => {
    expect(css).toContain("@media (hover: hover)");
    expect(css).toContain(".task-row__checkbox:hover");
  });

  it("suppresses checkbox hover transition under prefers-reduced-motion: reduce", () => {
    const reduceStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
    const hoverStart = css.indexOf("@media (hover: hover)");
    const checkboxInReduce = css.indexOf(".task-row__checkbox:hover", reduceStart);
    expect(checkboxInReduce).toBeGreaterThan(reduceStart);
    expect(checkboxInReduce).toBeLessThan(hoverStart);
  });
});

describe("TaskRow keyboard arrow navigation", () => {
  const task1 = baseTask({ id: "task-nav-1", text: "first task" });
  const task2 = baseTask({ id: "task-nav-2", text: "second task" });

  const renderTwoRows = (): { li1: HTMLElement; li2: HTMLElement } => {
    _tasksApiSeams.deleteFetch = mock(
      (_id: string): Promise<TasksDeleteResponse> =>
        new Promise<TasksDeleteResponse>(() => undefined),
    );
    render(() => (
      <QueryClientProvider client={noRetryClient()}>
        <ul>
          <TaskRow task={task1} />
          <TaskRow task={task2} />
        </ul>
      </QueryClientProvider>
    ));
    const [li1, li2] = Array.from(document.querySelectorAll("[data-task-id]")) as HTMLElement[];
    return { li1: li1!, li2: li2! };
  };

  let fakeInput: HTMLInputElement | null = null;

  afterEach(() => {
    fakeInput?.remove();
    fakeInput = null;
    cleanup();
  });

  const injectFakeInput = (): HTMLInputElement => {
    const el = document.createElement("input");
    el.setAttribute("aria-label", "New task");
    el.setAttribute("tabindex", "0");
    document.body.appendChild(el);
    fakeInput = el;
    return el;
  };

  it("ArrowDown on the <li> focuses the next [data-task-id] element", () => {
    const { li1, li2 } = renderTwoRows();
    li1.focus();
    fireEvent.keyDown(li1, { key: "ArrowDown" });
    expect(document.activeElement).toBe(li2);
  });

  it("ArrowDown on the last <li> is a no-op (stays focused)", () => {
    const { container } = renderRowWithDeleteClient(task1);
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "ArrowDown" });
    expect(document.activeElement).toBe(li);
  });

  it("j key on the <li> focuses the next [data-task-id] element", () => {
    const { li1, li2 } = renderTwoRows();
    li1.focus();
    fireEvent.keyDown(li1, { key: "j" });
    expect(document.activeElement).toBe(li2);
  });

  it("ArrowUp on the first <li> focuses TaskInput", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(task1);
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "ArrowUp" });
    expect(document.activeElement).toBe(fakeTaskInput);
  });

  it("ArrowUp on a non-first <li> focuses the previous row", () => {
    const { li1, li2 } = renderTwoRows();
    li2.focus();
    fireEvent.keyDown(li2, { key: "ArrowUp" });
    expect(document.activeElement).toBe(li1);
  });

  it("k key on the first <li> focuses TaskInput", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(task1);
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "k" });
    expect(document.activeElement).toBe(fakeTaskInput);
  });

  it("Arrow keys on a child element do not fire row-level navigation", () => {
    const { li1, li2 } = renderTwoRows();
    li1.focus();
    const checkbox = li1.querySelector('[role="checkbox"]') as HTMLElement;
    fireEvent.keyDown(checkbox, { key: "ArrowDown" });
    expect(document.activeElement).not.toBe(li2);
  });
});

describe("TaskRow Escape and i shortcut", () => {
  let fakeInput: HTMLInputElement | null = null;

  afterEach(() => {
    fakeInput?.remove();
    fakeInput = null;
    cleanup();
  });

  const injectFakeInput = (): HTMLInputElement => {
    const el = document.createElement("input");
    el.setAttribute("aria-label", "New task");
    el.setAttribute("tabindex", "0");
    document.body.appendChild(el);
    fakeInput = el;
    return el;
  };

  it("Escape on the <li> focuses TaskInput", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "Escape" });
    expect(document.activeElement).toBe(fakeTaskInput);
  });

  it("i on the <li> focuses TaskInput", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "i" });
    expect(document.activeElement).toBe(fakeTaskInput);
  });

  it("Escape on DeleteButton (child) focuses TaskInput via event bubbling", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const deleteButton = container.querySelector('[aria-label="Delete task"]') as HTMLElement;
    deleteButton.focus();
    fireEvent.keyDown(deleteButton, { key: "Escape" });
    expect(document.activeElement).toBe(fakeTaskInput);
  });

  it("i on DeleteButton (child) focuses TaskInput via event bubbling", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const deleteButton = container.querySelector('[aria-label="Delete task"]') as HTMLElement;
    deleteButton.focus();
    fireEvent.keyDown(deleteButton, { key: "i" });
    expect(document.activeElement).toBe(fakeTaskInput);
  });

  it("i on RetryAction (child) focuses TaskInput via event bubbling", () => {
    const fakeTaskInput = injectFakeInput();
    const task = baseTask({ id: "task-retry-i-shortcut" });
    __captureSyncMutators.markExhausted(task.id, () => undefined);
    const { container } = renderRowWithDeleteClient(task);
    const retryButton = container.querySelector(".task-row__retry-action") as HTMLElement;
    retryButton.focus();
    fireEvent.keyDown(retryButton, { key: "i" });
    expect(document.activeElement).toBe(fakeTaskInput);
  });
});

describe("TaskRow typing-anywhere-captures", () => {
  let fakeInput: HTMLInputElement | null = null;

  afterEach(() => {
    fakeInput?.remove();
    fakeInput = null;
    cleanup();
  });

  const injectFakeInput = (): HTMLInputElement => {
    const el = document.createElement("input");
    el.setAttribute("aria-label", "New task");
    el.setAttribute("tabindex", "0");
    document.body.appendChild(el);
    fakeInput = el;
    return el;
  };

  it("printable char on <li> appends to TaskInput and focuses it", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "a" });
    expect(document.activeElement).toBe(fakeTaskInput);
    expect(fakeTaskInput.value).toBe("a");
  });

  it("printable char on DeleteButton (child) appends to TaskInput via event bubbling", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const deleteButton = container.querySelector('[aria-label="Delete task"]') as HTMLElement;
    deleteButton.focus();
    fireEvent.keyDown(deleteButton, { key: "q" });
    expect(document.activeElement).toBe(fakeTaskInput);
    expect(fakeTaskInput.value).toBe("q");
  });

  it("Space on <li> does NOT append to TaskInput", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: " " });
    expect(fakeTaskInput.value).toBe("");
  });

  it("j on <li> does NOT append to TaskInput", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "j" });
    expect(fakeTaskInput.value).toBe("");
  });

  it("Ctrl+a on <li> does NOT trigger typing-anywhere", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "a", ctrlKey: true });
    expect(fakeTaskInput.value).toBe("");
  });

  it("printable char with existing value appends to end", () => {
    const fakeTaskInput = injectFakeInput();
    fakeTaskInput.value = "hello";
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "!" });
    expect(fakeTaskInput.value).toBe("hello!");
  });

  it("k on <li> does NOT append to TaskInput", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "k" });
    expect(fakeTaskInput.value).toBe("");
  });

  it("Shift+letter on <li> appends uppercase char (Shift alone is not excluded)", () => {
    const fakeTaskInput = injectFakeInput();
    const { container } = renderRowWithDeleteClient(baseTask());
    const li = container.querySelector("li")!;
    li.focus();
    fireEvent.keyDown(li, { key: "A", shiftKey: true });
    expect(document.activeElement).toBe(fakeTaskInput);
    expect(fakeTaskInput.value).toBe("A");
  });
});
