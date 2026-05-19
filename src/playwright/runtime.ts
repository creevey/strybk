import { createRequire } from "node:module";
import { resolve } from "node:path";

const isPlaywrightTestRuntime = (value: unknown): value is typeof import("@playwright/test") => {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return false;
  }

  return "expect" in value && "test" in value;
};

export const loadPlaywrightTestRuntime = (): typeof import("@playwright/test") => {
  const requireFromCwd = createRequire(resolve(process.cwd(), "package.json"));
  const runtime: unknown = requireFromCwd("@playwright/test");

  if (!isPlaywrightTestRuntime(runtime)) {
    throw new Error("Failed to load @playwright/test runtime");
  }

  return runtime;
};
