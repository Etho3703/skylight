import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const SHARED = resolve(__dirname, "../shared/src");
const SERVER = process.env.SERVER_URL ?? "http://localhost:3000";
const TRACKER = process.env.TRACKER_URL ?? "http://localhost:3001";

// A tab that reloads, navigates, hot-reloads or sleeps drops its proxied
// WebSocket mid-stream, and Vite prints a stack trace for each one. The page
// reconnects by itself, so leave those two out of the log.
const logger = createLogger();
const logError = logger.error.bind(logger);
logger.error = (msg, options) => {
  const code = (options?.error as { code?: string } | undefined)?.code;
  if (msg.includes("ws proxy socket error") && (code === "ECONNRESET" || code === "EPIPE")) return;
  logError(msg, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  resolve: {
    alias: { "@shared": SHARED },
  },
  server: {
    host: true, // expose dev server on LAN too
    // Vite only answers its own IPs and localhost; name the Mac so the phone
    // can use its mDNS name. Lowercase: browsers lowercase the Host header and
    // Vite matches it exactly.
    allowedHosts: ["katies-macbook-air.local"],
    fs: { allow: [resolve(__dirname, ".."), SHARED] },
    proxy: {
      // tracker first: more specific prefixes win over the bare /api below
      "/api/tracker": { target: TRACKER, changeOrigin: true },
      "/tracker-ws": { target: TRACKER, ws: true, changeOrigin: true },
      "/video": { target: TRACKER, changeOrigin: true },
      "/frame.jpg": { target: TRACKER, changeOrigin: true },
      "/api": { target: SERVER, changeOrigin: true },
      "/ws": { target: SERVER, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        control: resolve(__dirname, "control.html"),
        tracker: resolve(__dirname, "tracker.html"),
        tv: resolve(__dirname, "tv.html"),
        stream: resolve(__dirname, "stream.html"),
      },
    },
  },
});
