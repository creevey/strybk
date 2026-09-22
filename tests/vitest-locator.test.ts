import { describe, expect, it } from "bun:test";

import { createPortableLocator, toKeyboardSyntax } from "../src/vitest/locatorAdapter.js";

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface FakeLocator {
  readonly selector: string;
  readonly calls: RecordedCall[];
  click(options?: unknown): Promise<void>;
  dblClick(options?: unknown): Promise<void>;
  hover(options?: unknown): Promise<void>;
  clear(options?: unknown): Promise<void>;
  fill(text: string, options?: unknown): Promise<void>;
  dropTo(target: unknown, options?: unknown): Promise<void>;
  nth(index: number): FakeLocator;
  first(): FakeLocator;
  last(): FakeLocator;
  getByCSS(selector: string): FakeLocator;
}

const createFakeLocator = (selector = "css=.button"): FakeLocator => {
  const calls: RecordedCall[] = [];
  const record = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
  };

  return {
    selector,
    calls,
    click: (options) => {
      record("click", options);
      return Promise.resolve();
    },
    dblClick: (options) => {
      record("dblClick", options);
      return Promise.resolve();
    },
    hover: (options) => {
      record("hover", options);
      return Promise.resolve();
    },
    clear: (options) => {
      record("clear", options);
      return Promise.resolve();
    },
    fill: (text, options) => {
      record("fill", text, options);
      return Promise.resolve();
    },
    dropTo: (target, options) => {
      record("dropTo", target, options);
      return Promise.resolve();
    },
    nth: (index) => {
      record("nth", index);
      return createFakeLocator(`${selector} >> nth=${index}`);
    },
    first: () => {
      record("first");
      return createFakeLocator(`${selector} >> first`);
    },
    last: () => {
      record("last");
      return createFakeLocator(`${selector} >> last`);
    },
    getByCSS: (css) => {
      record("getByCSS", css);
      return createFakeLocator(`${selector} >> css=${css}`);
    },
  };
};

interface FakeUserEvent {
  readonly calls: Array<{ element: unknown; text: string; options?: unknown }>;
  type(element: unknown, text: string, options?: unknown): Promise<void>;
}

const createFakeUserEvent = (): FakeUserEvent => {
  const calls: FakeUserEvent["calls"] = [];

  return {
    calls,
    type: (element, text, options) => {
      calls.push({ element, text, options });
      return Promise.resolve();
    },
  };
};

describe("toKeyboardSyntax", () => {
  it("passes single characters through unchanged", () => {
    expect(toKeyboardSyntax("a")).toBe("a");
  });

  it("wraps named keys in braces", () => {
    expect(toKeyboardSyntax("Enter")).toBe("{Enter}");
  });

  it("wraps modifier chords in testing-library syntax", () => {
    expect(toKeyboardSyntax("Control+A")).toBe("{Control>}A{/Control}");
    expect(toKeyboardSyntax("Shift+Control+Z")).toBe("{Shift>}{Control>}Z{/Control}{/Shift}");
  });
});

describe("createPortableLocator", () => {
  it("delegates element actions to the wrapped locator with their options", async () => {
    const vitestLocator = createFakeLocator();
    const portable = createPortableLocator({
      selector: "#boxed",
      vitestLocator,
      userEvent: createFakeUserEvent(),
    });

    await portable.click({ position: { x: 1, y: 2 } });
    await portable.dblClick();
    await portable.hover({ position: { x: 3, y: 4 } });
    await portable.clear();
    await portable.fill("hello", { force: true });

    expect(portable.selector).toBe("#boxed");
    expect(portable.vitestLocator).toBe(vitestLocator);
    expect(vitestLocator.calls).toEqual([
      { method: "click", args: [{ position: { x: 1, y: 2 } }] },
      { method: "dblClick", args: [undefined] },
      { method: "hover", args: [{ position: { x: 3, y: 4 } }] },
      { method: "clear", args: [undefined] },
      { method: "fill", args: ["hello", { force: true }] },
    ]);
  });

  it("re-wraps nth, first, and last results", async () => {
    const vitestLocator = createFakeLocator();
    const userEvent = createFakeUserEvent();
    const portable = createPortableLocator({ selector: "#boxed", vitestLocator, userEvent });

    const second = portable.nth(2);
    const first = portable.first();
    const last = portable.last();

    expect(vitestLocator.calls).toEqual([
      { method: "nth", args: [2] },
      { method: "first", args: [] },
      { method: "last", args: [] },
    ]);
    expect(second.selector).toBe("css=.button >> nth=2");
    expect(first.selector).toBe("css=.button >> first");
    expect(last.selector).toBe("css=.button >> last");

    await second.hover({ position: { x: 0, y: 0 } });

    expect(second.vitestLocator.calls).toEqual([
      { method: "hover", args: [{ position: { x: 0, y: 0 } }] },
    ]);
  });

  it("scopes nested locators through getByCSS", async () => {
    const vitestLocator = createFakeLocator();
    const portable = createPortableLocator({
      selector: "#boxed",
      vitestLocator,
      userEvent: createFakeUserEvent(),
    });

    const nested = portable.locator(".child");

    expect(vitestLocator.calls).toEqual([{ method: "getByCSS", args: [".child"] }]);
    expect(nested.selector).toBe("css=.button >> css=.child");

    await nested.click();

    expect(nested.vitestLocator.calls).toEqual([{ method: "click", args: [undefined] }]);
  });

  it("maps dragTo to dropTo with Playwright-style positions", async () => {
    const vitestLocator = createFakeLocator();
    const userEvent = createFakeUserEvent();
    const portable = createPortableLocator({ selector: "#source", vitestLocator, userEvent });
    const target = createPortableLocator({
      selector: "#target",
      vitestLocator: createFakeLocator("#target"),
      userEvent,
    });

    await portable.dragTo(target, {
      sourcePosition: { x: 0, y: 0 },
      targetPosition: { x: 1, y: 2 },
      force: true,
    });

    expect(vitestLocator.calls).toEqual([
      {
        method: "dropTo",
        args: [
          target.vitestLocator,
          { sourcePosition: { x: 0, y: 0 }, targetPosition: { x: 1, y: 2 }, force: true },
        ],
      },
    ]);
  });

  it("maps type to userEvent.type with the wrapped locator", async () => {
    const vitestLocator = createFakeLocator();
    const userEvent = createFakeUserEvent();
    const portable = createPortableLocator({ selector: "#boxed", vitestLocator, userEvent });

    await portable.type("hello", { skipClick: true });

    expect(userEvent.calls).toEqual([
      { element: vitestLocator, text: "hello", options: { skipClick: true } },
    ]);
    expect(vitestLocator.calls).toEqual([]);
  });

  it("maps press to userEvent.type with keyboard syntax", async () => {
    const vitestLocator = createFakeLocator();
    const userEvent = createFakeUserEvent();
    const portable = createPortableLocator({ selector: "#boxed", vitestLocator, userEvent });

    await portable.press("Control+A");
    await portable.press("Enter", { timeout: 500 });

    expect(userEvent.calls).toEqual([
      { element: vitestLocator, text: "{Control>}A{/Control}", options: undefined },
      { element: vitestLocator, text: "{Enter}", options: { timeout: 500 } },
    ]);
  });
});
