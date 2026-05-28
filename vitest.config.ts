import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // lucide-react@0.469.0 has no `exports` field, so Vite 5 cannot resolve
      // the bare specifier; aliasing to its ESM barrel only relocates the
      // failure because the barrel re-exports ~1700 per-icon modules and this
      // install is missing `dist/esm/icons/gavel.js` on disk. Alias to an
      // auto-generated stub that statically re-declares every icon export name
      // (see the stub's header for regeneration notes).
      "lucide-react": path.resolve(
        __dirname,
        "tests/stubs/lucide-react.ts"
      ),
    },
  },
});
