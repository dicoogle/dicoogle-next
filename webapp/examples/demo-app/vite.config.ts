import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dicoogleNext } from "@dicoogle/dicoogle-next-webapp/vite";

// Like the nginx config of the Docker image: /next/api/* goes to the backend's /api/*.
const backendProxy = {
  "/next/api": {
    target: process.env.DICOOGLE_BACKEND_URL || "http://localhost:8080",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/next\/api/, "/api"),
  },
};

export default defineConfig({
  plugins: [react(), dicoogleNext()],
  base: process.env.BASE_PATH || "/",
  server: { proxy: backendProxy },
  preview: { proxy: backendProxy },
});
