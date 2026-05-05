import UnoCSS from "@unocss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid(), UnoCSS()],
  build: {
    target: ["chrome120", "edge120", "firefox120", "safari15"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
