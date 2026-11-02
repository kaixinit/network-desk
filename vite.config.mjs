import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["localhost", "127.0.0.1", "terminal.local"],
    proxy: Object.fromEntries(
      ["/api", "/scripts/collect-system.ps1"].map((prefix) => [
        prefix,
        {
          target: "http://127.0.0.1:8780",
          changeOrigin: true,
          configure(proxy) {
            proxy.on("proxyReq", (request) =>
              request.setHeader("Origin", "http://127.0.0.1:8780"),
            );
          },
        },
      ]),
    ),
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
