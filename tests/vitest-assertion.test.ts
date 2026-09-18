import { describe, expect, it } from "bun:test";

import {
  resolveCaptureTarget,
  sanitizeScreenshotName,
  toMatchScreenshotOptions,
  toScreenshotName,
} from "../src/vitest/assertion.js";

describe("sanitizeScreenshotName", () => {
  it("collapses whitespace into dashes", () => {
    expect(sanitizeScreenshotName("Default Story")).toBe("Default-Story");
  });

  it("strips non-word characters and collapses runs of dashes", () => {
    expect(sanitizeScreenshotName("Components > Button > Default")).toBe(
      "Components-Button-Default",
    );
  });

  it("keeps underscores and digits, drops punctuation", () => {
    expect(sanitizeScreenshotName("It's (dark_modal #2)!")).toBe("Its-dark_modal-2");
  });

  it("keeps path segments when they appear in one segment name", () => {
    expect(sanitizeScreenshotName("My / Modal")).toBe("My-Modal");
  });
});

describe("toScreenshotName", () => {
  it("joins the full test-name chain and sanitizes it", () => {
    expect(toScreenshotName(["Components", "Button", "Default"])).toBe("Components-Button-Default");
  });

  it("returns the sanitized single name for unnested tests", () => {
    expect(toScreenshotName(["Default"])).toBe("Default");
  });
});

describe("toMatchScreenshotOptions", () => {
  it("pins Playwright-parity defaults with an empty mask for no options", () => {
    expect(toMatchScreenshotOptions({}, (entry) => entry)).toEqual({
      comparatorOptions: { threshold: 0.2 },
      screenshotOptions: {
        animations: "disabled",
        scale: "css",
        mask: [],
      },
    });
  });

  it("maps every mask entry into the embedded preview", () => {
    const mapped: unknown[] = [];

    const result = toMatchScreenshotOptions(
      { mask: ["#one", "#two"] },
      (entry) => `preview:${String(entry)}`,
    );

    for (const entry of result.screenshotOptions?.mask ?? []) {
      mapped.push(entry);
    }

    expect(mapped).toEqual(["preview:#one", "preview:#two"]);
  });

  it("keeps threshold and scale pinned when mask options are given", () => {
    const result = toMatchScreenshotOptions({ mask: ["#one"] }, (entry) => entry);

    expect(result.comparatorOptions).toEqual({ threshold: 0.2 });
    expect(result.screenshotOptions?.scale).toBe("css");
    expect(result.screenshotOptions?.animations).toBe("disabled");
  });
});

describe("resolveCaptureTarget", () => {
  it("targets the embedded preview iframe when captureElement is unset", () => {
    expect(
      resolveCaptureTarget({
        captureElement: null,
        elementTarget: (selector) => `element:${selector}`,
        viewportTarget: "viewport",
      }),
    ).toBe("viewport");
  });

  it("targets the in-preview element when captureElement is a selector", () => {
    expect(
      resolveCaptureTarget({
        captureElement: "#storybook-root",
        elementTarget: (selector) => `element:${selector}`,
        viewportTarget: "viewport",
      }),
    ).toBe("element:#storybook-root");
  });
});
