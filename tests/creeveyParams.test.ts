import { describe, expect, it } from "vitest";

import {
  deserializeRegExp,
  isSerializedRegExp,
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
