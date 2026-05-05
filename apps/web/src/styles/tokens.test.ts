import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

type ThemeTokens = Record<string, string>;

const css = readFileSync(join(import.meta.dir, "tokens.css"), "utf8");

const parseTokens = (source: string): ThemeTokens => {
  const tokens: ThemeTokens = {};
  const matches = source.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6}|[0-9.]+(?:rem|px|ms)?);/gi);
  for (const match of matches) {
    tokens[match[1] ?? ""] = match[2] ?? "";
  }
  return tokens;
};

const block = (pattern: RegExp): string => {
  const match = pattern.exec(css);
  return match?.[1] ?? "";
};

const lightTokens = parseTokens(block(/:root\s*{([\s\S]*?)\n}/));
const darkTokens = parseTokens(block(/\[data-theme="dark"]\s*{([\s\S]*?)\n}/));

const luminance = (hex: string): number => {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
};

const contrast = (foreground: string, background: string): number => {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

describe("design tokens", () => {
  it("keeps muted text AA-contrast on canvas and subtle backgrounds in both themes", () => {
    const cases = [
      [lightTokens["color-text-muted"], lightTokens["color-bg-canvas"]],
      [lightTokens["color-text-muted"], lightTokens["color-bg-subtle"]],
      [darkTokens["color-text-muted"], darkTokens["color-bg-canvas"]],
      [darkTokens["color-text-muted"], darkTokens["color-bg-subtle"]],
    ] as const;

    for (const [foreground, background] of cases) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
