import { describe, expect, it } from "bun:test";

import {
  DEFAULT_BROWSER_IDENTITY,
  STRYBK_BROWSER_KEY,
  STRYBK_GLOBALS_KEY,
  readStrybkIdentity,
  resolveBrowserIdentity,
} from "../src/vitest/identity.js";
import { toStorybookGlobals } from "../src/storybook/globals.js";

describe("resolveBrowserIdentity", () => {
  it("returns a provided non-empty string identity", () => {
    expect(resolveBrowserIdentity("firefox")).toBe("firefox");
  });

  it("defaults to chromium when nothing is provided", () => {
    expect(resolveBrowserIdentity(undefined)).toBe("chromium");
    expect(DEFAULT_BROWSER_IDENTITY).toBe("chromium");
  });

  it("falls back to chromium for empty or non-string values", () => {
    expect(resolveBrowserIdentity("")).toBe("chromium");
    expect(resolveBrowserIdentity(123)).toBe("chromium");
  });
});

describe("toStorybookGlobals", () => {
  it("keeps primitive global values", () => {
    expect(toStorybookGlobals({ theme: "dark", compact: true, count: 2, off: null })).toEqual({
      theme: "dark",
      compact: true,
      count: 2,
      off: null,
    });
  });

  it("drops non-primitive values", () => {
    expect(toStorybookGlobals({ theme: "dark", bad: { nested: true }, worse: [1] })).toEqual({
      theme: "dark",
    });
  });

  it("returns undefined for absent or invalid globals", () => {
    expect(toStorybookGlobals(undefined)).toBeUndefined();
    expect(toStorybookGlobals(null)).toBeUndefined();
    expect(toStorybookGlobals(["theme:dark"])).toBeUndefined();
    expect(toStorybookGlobals("theme:dark")).toBeUndefined();
  });
});

describe("readStrybkIdentity", () => {
  it("reads browser and globals through the inject surface", () => {
    const identity = readStrybkIdentity((key: string): unknown =>
      key === STRYBK_BROWSER_KEY ? "webkit" : { theme: "dark" },
    );

    expect(identity.browser).toBe("webkit");
    expect(identity.globals).toEqual({ theme: "dark" });
  });

  it("reads the globals key explicitly", () => {
    const keys: string[] = [];

    readStrybkIdentity((key: string): unknown => {
      keys.push(key);

      return undefined;
    });

    expect(keys).toContain(STRYBK_GLOBALS_KEY);
  });

  it("applies documented defaults when both provides are absent", () => {
    const identity = readStrybkIdentity((): undefined => undefined);

    expect(identity).toEqual({ browser: "chromium", globals: undefined });
  });
});
