import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Renderer build. We emit relative paths because the production build is
// loaded over file:// from the packaged app — absolute paths would break.
export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/renderer", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
