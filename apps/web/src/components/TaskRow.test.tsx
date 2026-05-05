import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import type { Task } from "../data/api";
import { TaskRow } from "./TaskRow";

afterEach(() => {
  cleanup();
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
