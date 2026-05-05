import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const source = readFileSync(join(import.meta.dir, "ErrorBoundary.tsx"), "utf8");

describe("ErrorBoundary source contract", () => {
  it("keeps the inline alert fallback copy", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain("Something went wrong. Refresh to try again.");
  });

  it("wraps Solid's ErrorBoundary instead of duplicating error handling", () => {
    expect(source).toContain("ErrorBoundary as SolidErrorBoundary");
    expect(source).toContain("<SolidErrorBoundary");
  });
});
