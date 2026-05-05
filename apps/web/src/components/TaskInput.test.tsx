import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import axe from "axe-core";
import { CHARACTER_COUNTER_THRESHOLD, MAX_TASK_LENGTH } from "../constants";
import { TaskInput } from "./TaskInput";

afterEach(() => {
  cleanup();
});

const renderTaskInput = (): {
  container: HTMLElement;
  input: HTMLInputElement;
  onSubmit: ReturnType<typeof mock>;
  queryByText: (matcher: string | RegExp) => HTMLElement | null;
  getByText: (matcher: string | RegExp) => HTMLElement;
} => {
  const onSubmit = mock((_text: string) => {});
  const result = render(() => <TaskInput onSubmit={onSubmit} />);
  const input = result.getByLabelText("New task") as HTMLInputElement;
  return {
    container: result.container,
    input,
    onSubmit,
    queryByText: result.queryByText as (matcher: string | RegExp) => HTMLElement | null,
    getByText: result.getByText as (matcher: string | RegExp) => HTMLElement,
  };
};

const typeValue = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  fireEvent.input(input);
};

describe("TaskInput", () => {
  it("auto-focuses the input on mount", () => {
    const { input } = renderTaskInput();
    expect(document.activeElement).toBe(input);
  });

  it("renders required ARIA, autocomplete, capitalization, and maxlength attributes", () => {
    const { input } = renderTaskInput();
    expect(input.getAttribute("aria-label")).toBe("New task");
    expect(input.getAttribute("placeholder")).toBe("What needs doing?");
    expect(input.getAttribute("maxlength")).toBe(String(MAX_TASK_LENGTH));
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("autocapitalize")).toBe("sentences");
    expect(input.getAttribute("spellcheck")).toBe("true");
    expect(input.getAttribute("type")).toBe("text");
  });

  it("submits the trimmed value on Enter, clears, and retains focus", () => {
    const { input, onSubmit } = renderTaskInput();
    typeValue(input, "  hi  ");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("hi");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("does not submit when the input is empty", () => {
    const { input, onSubmit } = renderTaskInput();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("does not submit when the input is whitespace only and leaves the value untouched", () => {
    const { input, onSubmit } = renderTaskInput();
    typeValue(input, "   ");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("   ");
  });

  it("does not submit on Shift+Enter and preserves the typed value", () => {
    const { input, onSubmit } = renderTaskInput();
    typeValue(input, "buy milk");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("buy milk");
  });

  it("clears a non-empty value on Escape and retains focus", () => {
    const { input } = renderTaskInput();
    typeValue(input, "draft thought");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("is a no-op when Escape is pressed on an empty input", () => {
    const { input, onSubmit } = renderTaskInput();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("does not render CharacterCounter below the visibility threshold", () => {
    const { input, queryByText } = renderTaskInput();
    typeValue(input, "x".repeat(CHARACTER_COUNTER_THRESHOLD - 1));
    expect(queryByText(/\/\s*500$/)).toBeNull();
  });

  it("renders CharacterCounter exactly at the threshold with aria-live=polite", () => {
    const { input, getByText } = renderTaskInput();
    typeValue(input, "x".repeat(CHARACTER_COUNTER_THRESHOLD));
    const counter = getByText(`${CHARACTER_COUNTER_THRESHOLD} / ${MAX_TASK_LENGTH}`);
    expect(counter.getAttribute("aria-live")).toBe("polite");
  });

  it("updates CharacterCounter as the value grows above the threshold", () => {
    const { input, getByText } = renderTaskInput();
    typeValue(input, "x".repeat(CHARACTER_COUNTER_THRESHOLD + 12));
    expect(getByText(`${CHARACTER_COUNTER_THRESHOLD + 12} / ${MAX_TASK_LENGTH}`)).toBeDefined();
  });

  it("renders 500 / 500 at the maxlength limit", () => {
    const { input, getByText } = renderTaskInput();
    typeValue(input, "x".repeat(MAX_TASK_LENGTH));
    expect(input.value.length).toBe(MAX_TASK_LENGTH);
    expect(getByText(`${MAX_TASK_LENGTH} / ${MAX_TASK_LENGTH}`)).toBeDefined();
  });

  it("does not submit on Enter while an IME composition is in progress", () => {
    const { input, onSubmit } = renderTaskInput();
    typeValue(input, "ni");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe("ni");
  });

  it("reports no critical or serious axe-core violations in the populated state", async () => {
    const { container, input } = renderTaskInput();
    typeValue(input, "x".repeat(CHARACTER_COUNTER_THRESHOLD + 5));
    const results = await axe.run(container);
    const blocking = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});

describe("TaskInput arrow-down navigation", () => {
  let fakeLi: HTMLElement | null = null;

  afterEach(() => {
    fakeLi?.remove();
    fakeLi = null;
    cleanup();
  });

  const injectFakeRow = (id = "fake-row-id"): HTMLElement => {
    const el = document.createElement("li");
    el.setAttribute("data-task-id", id);
    el.setAttribute("tabindex", "0");
    document.body.appendChild(el);
    fakeLi = el;
    return el;
  };

  it("ArrowDown focuses the first [data-task-id] element when list is populated", () => {
    const fakeRow = injectFakeRow();
    const { input } = renderTaskInput();
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement).toBe(fakeRow);
  });

  it("ArrowDown is a no-op when no [data-task-id] element exists", () => {
    const { input } = renderTaskInput();
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement).toBe(input);
  });
});
