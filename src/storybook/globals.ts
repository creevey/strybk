import type { StorybookGlobals } from "../config.js";

export const isStorybookGlobalValue = (value: unknown): value is StorybookGlobals[string] =>
  value === null ||
  value === undefined ||
  typeof value === "boolean" ||
  typeof value === "number" ||
  typeof value === "string";

export const toStorybookGlobals = (value: unknown): StorybookGlobals | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => isStorybookGlobalValue(entry)),
  ) as StorybookGlobals;
};
