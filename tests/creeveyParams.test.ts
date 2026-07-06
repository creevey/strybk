import { describe, expect, it } from "vitest";

import {
  deserializeRegExp,
  isSerializedRegExp,
  normalizeCreeveyParams,
  resolveCreeveyStory,
  shouldSkip,
  type CreeveyStoryParams,
  type SerializedRegExp,
  type StoriesRaw,
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

describe("normalizeCreeveyParams", () => {
  const browser = "chrome";
  const meta = { title: "Button", name: "Default" };

  it("returns a viewport/empty default when creevey params are absent", () => {
    expect(normalizeCreeveyParams(undefined, browser, meta)).toEqual({
      skip: false,
      captureElement: null,
      ignoreElements: [],
    });
  });

  it("normalizes captureElement (string stays, null stays, absent -> null)", () => {
    expect(normalizeCreeveyParams({ captureElement: "#root" }, browser, meta).captureElement).toBe(
      "#root",
    );
    expect(normalizeCreeveyParams({ captureElement: null }, browser, meta).captureElement).toBe(
      null,
    );
    expect(normalizeCreeveyParams({}, browser, meta).captureElement).toBe(null);
  });

  it("normalizes ignoreElements into an array", () => {
    expect(normalizeCreeveyParams({ ignoreElements: ".x" }, browser, meta).ignoreElements).toEqual([
      ".x",
    ]);
    expect(
      normalizeCreeveyParams({ ignoreElements: [".a", ".b"] }, browser, meta).ignoreElements,
    ).toEqual([".a", ".b"]);
    expect(normalizeCreeveyParams({ ignoreElements: null }, browser, meta).ignoreElements).toEqual(
      [],
    );
  });

  it("resolves skip against browser/kind/name and carries the reason", () => {
    const params: CreeveyStoryParams = { skip: { "no ie": { in: "ie11" } } };

    expect(normalizeCreeveyParams(params, "chrome", meta)).toMatchObject({
      skip: false,
      reason: undefined,
    });
    expect(normalizeCreeveyParams(params, "ie11", meta)).toMatchObject({
      skip: true,
      reason: "no ie",
    });
  });

  it("handles serialized regexps inside skip options (runtime extract form)", () => {
    const params: CreeveyStoryParams = {
      skip: { ff: { in: { __regexp: true, source: "fire", flags: "" } } },
    };

    expect(normalizeCreeveyParams(params, "firefox", meta)).toMatchObject({
      skip: true,
      reason: "ff",
    });
  });
});

describe("resolveCreeveyStory", () => {
  const stories: StoriesRaw = {
    "button--default": {
      title: "Button",
      name: "Default",
      parameters: { creevey: { captureElement: "#root" } },
    },
  };

  it("resolves merged params for the story id", () => {
    expect(resolveCreeveyStory(stories, "button--default", "chrome")).toMatchObject({
      captureElement: "#root",
    });
  });

  it("throws when the story id is missing", () => {
    expect(() => resolveCreeveyStory(stories, "nope--missing", "chrome")).toThrow(/nope--missing/u);
  });
});
