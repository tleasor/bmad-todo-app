import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const source = readFileSync(join(import.meta.dir, "LiveRegion.tsx"), "utf8");

describe("LiveRegion source contract", () => {
  it("renders a single polite atomic visually-hidden live region", () => {
    expect(source).toContain('class="sr-only"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-atomic="true"');
  });

  it("exports the shared announcement API and test reset helpers", () => {
    expect(source).toContain("export const announce");
    expect(source).toContain("export const __resetLiveRegionForTests");
    expect(source).toContain("export const __getLiveRegionMessageForTests");
  });
});
