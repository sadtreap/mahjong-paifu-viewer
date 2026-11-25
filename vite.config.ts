import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works under any GitHub Pages path (or a custom domain).
  base: "./",
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
