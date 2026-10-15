// Neon infrastructure for Monsoon's account sync.
// Managed Better Auth handles sign-up/sign-in; the `sync` Function stores each user's progress.
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    sync: {
      name: "monsoon sync",
      source: "src/index.ts",
    },
  },
});
