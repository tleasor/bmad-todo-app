import presetMini from "@unocss/preset-mini";
import { defineConfig } from "unocss";

const themeVars = {
  "bg-canvas": "var(--color-bg-canvas)",
  "bg-surface": "var(--color-bg-surface)",
  "bg-subtle": "var(--color-bg-subtle)",
  "border-default": "var(--color-border-default)",
  "border-strong": "var(--color-border-strong)",
  "text-primary": "var(--color-text-primary)",
  "text-secondary": "var(--color-text-secondary)",
  "text-muted": "var(--color-text-muted)",
  "text-disabled": "var(--color-text-disabled)",
  "accent-default": "var(--color-accent-default)",
  "accent-subtle": "var(--color-accent-subtle)",
  "status-pending": "var(--color-status-pending)",
  "status-error": "var(--color-status-error)",
  "status-error-subtle": "var(--color-status-error-subtle)",
} as const;

export default defineConfig({
  presets: [presetMini()],
  rules: [
    [
      /^bg-token-(.+)$/,
      ([, token]) => ({ background: themeVars[token as keyof typeof themeVars] }),
    ],
    [
      /^border-token-(.+)$/,
      ([, token]) => ({ "border-color": themeVars[token as keyof typeof themeVars] }),
    ],
    [/^text-token-(.+)$/, ([, token]) => ({ color: themeVars[token as keyof typeof themeVars] })],
  ],
  theme: {
    colors: themeVars,
    fontFamily: {
      sans: "var(--font-sans)",
    },
    spacing: {
      0: "var(--space-0)",
      1: "var(--space-1)",
      2: "var(--space-2)",
      3: "var(--space-3)",
      4: "var(--space-4)",
      5: "var(--space-5)",
      6: "var(--space-6)",
      8: "var(--space-8)",
      10: "var(--space-10)",
      12: "var(--space-12)",
      16: "var(--space-16)",
    },
    borderRadius: {
      sm: "var(--radius-sm)",
      md: "var(--radius-md)",
      full: "var(--radius-full)",
    },
    duration: {
      instant: "var(--motion-instant)",
      short: "var(--motion-short)",
      medium: "var(--motion-medium)",
      long: "var(--motion-long)",
    },
  },
});
