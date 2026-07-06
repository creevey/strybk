import { describe, expect, it } from "vitest";

import {
  deserializeRegExp,
  isSerializedRegExp,
  shouldSkip,
  type SerializedRegExp,
} from "../src/storybook/creeveyParams.js";

describe("serialized regexp", () => {
  it("identifies serialized regexp objects", () => {
    const serialized: SerializedRegExp = { __regexp: true, source: "fire", flags: "i" };

    expect(isSerializedRegExp(serialized)).toBe(true);
    expect(isSerializedRegExp({ source: "fire", flags: "i" })).toBe(false);
    expect(isSerializedRegExp(null)).toBe(false);
    expect(isSerializedRegExp(undefined)).toBe(false);
  });

  it("deserializes a serialized regexp into a RegExp", () => {
    const serialized: SerializedRegExp = { __regexp: true, source: "^fire", flags: "i" };
    const regExp = deserializeRegExp(serialized);

    expect(regExp).toBeInstanceOf(RegExp);
    expect(regExp.source).toBe("^fire");
    expect(regExp.flags).toBe("i");
    expect(regExp.test("FIREFOX")).toBe(true);
  });
});

describe("shouldSkip", () => {
  const meta = { title: "Button", name: "Default" };

  it("returns the value for boolean and string shorthand", () => {
    expect(shouldSkip("chrome", meta, true)).toBe(true);
    expect(shouldSkip("chrome", meta, false)).toBe(false);
    expect(shouldSkip("chrome", meta, "flaky")).toBe("flaky");
  });

  it("matches by browser string, array, or regexp", () => {
    expect(shouldSkip("chrome", meta, { "no ie": { in: "ie11" } })).toBe(false);
    expect(shouldSkip("ie11", meta, { "no ie": { in: "ie11" } })).toBe("no ie");
    expect(shouldSkip("firefox", meta, { ff: { in: ["firefox", "ff"] } })).toBe("ff");
    expect(
      shouldSkip("firefox", meta, {
        ff: { in: { __regexp: true, source: "fire", flags: "" } },
      }),
    ).toBe("ff");
    expect(shouldSkip("firefox", meta, { ff: { in: /fire.*/u } })).toBe("ff");
    expect(shouldSkip("chrome", meta, { ff: { in: /fire.*/u } })).toBe(false);
  });

  it("ANDs across browser, kind, and story dimensions", () => {
    expect(shouldSkip("chrome", meta, { r: { in: "chrome", stories: "Default" } })).toBe("r");
    expect(shouldSkip("chrome", meta, { r: { in: "chrome", stories: "Other" } })).toBe(false);
    expect(shouldSkip("chrome", meta, { r: { in: "chrome", kinds: "Button" } })).toBe("r");
    expect(shouldSkip("chrome", meta, { r: { in: "chrome", kinds: "Modal" } })).toBe(false);
  });

  it("treats an absent dimension as match-all", () => {
    expect(shouldSkip("chrome", meta, { any: {} })).toBe("any");
  });

  it("ORs across an array of skip options", () => {
    const skipOptions = { r: [{ in: "ie11" }, { stories: "Other" }] };
    expect(shouldSkip("chrome", meta, skipOptions)).toBe(false);
    expect(shouldSkip("ie11", meta, skipOptions)).toBe("r");
    expect(shouldSkip("chrome", { title: "X", name: "Other" }, skipOptions)).toBe("r");
  });
});
