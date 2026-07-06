# creevey.captureElement + Runtime Parameter Resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate Playwright screenshot specs that honor `story.parameters.creevey.captureElement` (and `skip`, `ignoreElements`) by resolving merged Storybook parameters at test runtime.

**Architecture:** A new pure module (`src/storybook/creeveyParams.ts`) ports creevey's skip-matching + regex deserialization and exposes `resolveCreeveyStory(stories, id, browser)`. A thin page-bound module (`src/storybook/extract.ts`) reads `window.__STORYBOOK_PREVIEW__.extract()` once. The worker fixture caches the extracted stories; a new test-scoped `creevey` fixture exposes `params(storyId)`. `render.ts` emits a Shape B test body that uses it. The generate-time source-parsing path (`metadata.ts`) and the `metadataExtractors` config option are deleted — every story now emits a test, with skip decided at runtime.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Bun (`bun test`), Playwright (`@playwright/test` peer dep), oxlint/oxfmt, vitest imports in tests.

**Spec:** `docs/superpowers/specs/2026-07-06-creevey-capture-element-design.md`

---

## File Structure

**Created:**

- `src/storybook/creeveyParams.ts` — pure: regex (de)serialization, skip matching (ported from creevey), `normalizeCreeveyParams`, `resolveCreeveyStory`, all shared types (`CreeveyStoryParams`, `NormalizedCreeveyParams`, `SkipOptions`, `StoriesRaw`, `CreeveyApi`).
- `src/storybook/extract.ts` — page-bound: `extractStories(page)`; pure guard `toStoriesRaw(value)`.
- `tests/creeveyParams.test.ts` — pure unit tests for the above.
- `tests/extract.test.ts` — unit test for `toStoriesRaw`.

**Modified:**

- `src/generate/render.ts` — new Shape B test-body template.
- `src/generate/index.ts` — drop creevey source-parsing & skip filtering; every story emits a test.
- `src/config.ts` — remove `metadataExtractors`.
- `src/playwright/fixtures.ts` — worker-scoped story cache + test-scoped `creevey` fixture.
- `tests/generate.test.ts` — update render assertions; remove 4 skip-filtering cases; add 1 regression case.
- `README.md` — document captureElement/skip/ignoreElements behavior + Playwright prerequisite.

**Deleted:**

- `src/generate/metadata.ts`
- `tests/metadata.test.ts`

---

## Task 1: Regex (de)serialization primitives

**Files:**

- Create: `src/storybook/creeveyParams.ts`
- Test: `tests/creeveyParams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/creeveyParams.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/creeveyParams.test.ts`
Expected: FAIL — `Cannot find module '../src/storybook/creeveyParams.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/storybook/creeveyParams.ts`:

```ts
export interface SerializedRegExp {
  __regexp: true;
  source: string;
  flags: string;
}

export const isSerializedRegExp = (value: unknown): value is SerializedRegExp =>
  typeof value === "object" && value !== null && Reflect.get(value, "__regexp") === true;

export const deserializeRegExp = ({ source, flags }: SerializedRegExp): RegExp =>
  new RegExp(source, flags);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/creeveyParams.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/storybook/creeveyParams.ts tests/creeveyParams.test.ts
git commit -m "feat: add creevey regex deserialization helpers"
```

---

## Task 2: Deep deserialization + skip-option matching

**Files:**

- Modify: `src/storybook/creeveyParams.ts`
- Test: `tests/creeveyParams.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/creeveyParams.test.ts` (before the final closing; add a new `import` for `deserializeDeep`, `shouldSkip`):

Update the import block at the top to:

```ts
import {
  deserializeDeep,
  deserializeRegExp,
  isSerializedRegExp,
  shouldSkip,
  type SerializedRegExp,
} from "../src/storybook/creeveyParams.js";
```

Append these describes:

```ts
describe("deserializeDeep", () => {
  it("replaces serialized regexps inside nested objects and arrays", () => {
    const input = {
      reason: {
        in: [{ __regexp: true, source: "fire", flags: "i" } as SerializedRegExp],
        stories: { __regexp: true, source: "^Load", flags: "" } as SerializedRegExp,
      },
    };

    const result = deserializeDeep(input);

    expect(result.reason.in[0]).toBeInstanceOf(RegExp);
    expect((result.reason.in[0] as RegExp).test("Firefox")).toBe(true);
    expect(result.reason.stories).toBeInstanceOf(RegExp);
  });

  it("passes through primitives and plain values untouched", () => {
    expect(deserializeDeep("chrome")).toBe("chrome");
    expect(deserializeDeep(3)).toBe(3);
    expect(deserializeDeep(null)).toBe(null);
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
        ff: { in: { __regexp: true, source: "fire", flags: "" } as SerializedRegExp },
      }),
    ).toBe("ff");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/creeveyParams.test.ts`
Expected: FAIL — `deserializeDeep` / `shouldSkip` not exported

- [ ] **Step 3: Write minimal implementation**

Append to `src/storybook/creeveyParams.ts`:

```ts
export interface SkipOption {
  in?: string | string[] | RegExp;
  kinds?: string | string[] | RegExp;
  stories?: string | string[] | RegExp;
}

export type SkipOptions = boolean | string | Record<string, SkipOption | SkipOption[]>;

export const deserializeDeep = <T>(value: T): T => {
  if (isSerializedRegExp(value)) {
    return deserializeRegExp(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => deserializeDeep(entry)) as unknown as T;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        deserializeDeep(entry),
      ]),
    ) as unknown as T;
  }

  return value;
};

const matchBy = (pattern: string | string[] | RegExp | undefined, value: string): boolean =>
  (typeof pattern === "string" && pattern === value) ||
  (Array.isArray(pattern) && pattern.includes(value)) ||
  (pattern instanceof RegExp && pattern.test(value)) ||
  pattern === undefined;

export const shouldSkipByOption = (
  browser: string,
  meta: { title: string; name: string },
  skipOption: SkipOption | SkipOption[],
  reason: string,
): boolean | string => {
  if (Array.isArray(skipOption)) {
    for (const option of skipOption) {
      const result = shouldSkipByOption(browser, meta, option, reason);

      if (result) {
        return result;
      }
    }

    return false;
  }

  const { in: browsers, kinds, stories } = skipOption;
  const skipByBrowser = matchBy(browsers, browser);
  const skipByKind = matchBy(kinds, meta.title);
  const skipByStory = matchBy(stories, meta.name);

  return skipByBrowser && skipByKind && skipByStory && reason;
};

export const shouldSkip = (
  browser: string,
  meta: { title: string; name: string },
  skipOptions: SkipOptions,
): boolean | string => {
  if (typeof skipOptions !== "object") {
    return skipOptions;
  }

  for (const reason of Object.keys(skipOptions)) {
    const result = shouldSkipByOption(browser, meta, skipOptions[reason], reason);

    if (result) {
      return result;
    }
  }

  return false;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/creeveyParams.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/storybook/creeveyParams.ts tests/creeveyParams.test.ts
git commit -m "feat: add creevey skip-option matching"
```

---

## Task 3: Normalization + `resolveCreeveyStory`

**Files:**

- Modify: `src/storybook/creeveyParams.ts`
- Test: `tests/creeveyParams.test.ts`

- [ ] **Step 1: Write the failing test**

Update the import block to add `normalizeCreeveyParams`, `resolveCreeveyStory`, and the types `CreeveyStoryParams`, `StoriesRaw`:

```ts
import {
  deserializeDeep,
  deserializeRegExp,
  isSerializedRegExp,
  normalizeCreeveyParams,
  resolveCreeveyStory,
  shouldSkip,
  type CreeveyStoryParams,
  type SerializedRegExp,
  type StoriesRaw,
} from "../src/storybook/creeveyParams.js";
```

Append these describes:

```ts
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
    expect(() => resolveCreeveyStory(stories, "nope--missing", "chrome")).toThrow(/nope--missing/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/creeveyParams.test.ts`
Expected: FAIL — `normalizeCreeveyParams` / `resolveCreeveyStory` not exported

- [ ] **Step 3: Write minimal implementation**

Append to `src/storybook/creeveyParams.ts`:

```ts
export interface CreeveyStoryParams {
  captureElement?: string | null;
  ignoreElements?: string | string[] | null;
  skip?: SkipOptions;
}

export interface NormalizedCreeveyParams {
  skip: boolean;
  reason?: string;
  captureElement: string | null;
  ignoreElements: string[];
}

export interface StoriesRaw {
  [storyId: string]: {
    title: string;
    name: string;
    parameters?: { creevey?: CreeveyStoryParams };
  };
}

export interface CreeveyApi {
  params(storyId: string): NormalizedCreeveyParams;
}

const toArray = (value: string | string[] | null | undefined): string[] => {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

export const normalizeCreeveyParams = (
  raw: CreeveyStoryParams | undefined,
  browser: string,
  meta: { title: string; name: string },
): NormalizedCreeveyParams => {
  if (raw === undefined) {
    return { skip: false, captureElement: null, ignoreElements: [] };
  }

  const skipResult =
    raw.skip === undefined ? false : shouldSkip(browser, meta, deserializeDeep(raw.skip));

  return {
    skip: skipResult !== false,
    reason: typeof skipResult === "string" ? skipResult : undefined,
    captureElement: raw.captureElement === undefined ? null : raw.captureElement,
    ignoreElements: toArray(raw.ignoreElements),
  };
};

export const resolveCreeveyStory = (
  stories: StoriesRaw,
  storyId: string,
  browser: string,
): NormalizedCreeveyParams => {
  const story = stories[storyId];

  if (story === undefined) {
    throw new Error(`Story '${storyId}' not found in extracted Storybook stories`);
  }

  return normalizeCreeveyParams(story.parameters?.creevey, browser, {
    title: story.title,
    name: story.name,
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/creeveyParams.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/storybook/creeveyParams.ts tests/creeveyParams.test.ts
git commit -m "feat: resolve creevey story params from extracted stories"
```

---

## Task 4: `extract.ts` (page-bound) + pure guard

**Files:**

- Create: `src/storybook/extract.ts`
- Test: `tests/extract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/extract.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toStoriesRaw } from "../src/storybook/extract.js";

describe("toStoriesRaw", () => {
  it("returns the value when it is a non-null object", () => {
    const stories = { "button--default": { title: "Button", name: "Default", parameters: {} } };

    expect(toStoriesRaw(stories)).toBe(stories);
  });

  it("throws when the preview returned nothing", () => {
    expect(() => toStoriesRaw(undefined)).toThrow(/Storybook preview/);
    expect(() => toStoriesRaw(null)).toThrow(/Storybook preview/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/extract.test.ts`
Expected: FAIL — `Cannot find module '../src/storybook/extract.js'`

- [ ] **Step 3: Write minimal implementation**

Create `src/storybook/extract.ts`:

```ts
import type { Page } from "@playwright/test";

import type { StoriesRaw } from "./creeveyParams.js";

interface StorybookPreviewWindow {
  __STORYBOOK_PREVIEW__?: {
    extract?: () => unknown;
  };
}

export const toStoriesRaw = (value: unknown): StoriesRaw => {
  if (value === undefined || value === null) {
    throw new Error("Storybook preview not available; is Storybook fully loaded?");
  }

  return value as StoriesRaw;
};

export const extractStories = async (page: Page): Promise<StoriesRaw> =>
  toStoriesRaw(
    await page.evaluate(() => {
      const preview = (window as unknown as StorybookPreviewWindow).__STORYBOOK_PREVIEW__;

      return preview?.extract?.();
    }),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/extract.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/storybook/extract.ts tests/extract.test.ts
git commit -m "feat: extract merged storybook params at runtime"
```

---

## Task 5: `render.ts` Shape B template

**Files:**

- Modify: `src/generate/render.ts`
- Test: `tests/generate.test.ts` (the `renderScreenshotSpec` describe block only)

- [ ] **Step 1: Write the failing test**

In `tests/generate.test.ts`, replace the first `it(...)` inside `describe("renderScreenshotSpec", ...)` (the one titled "renders generated tests and preserves the manual region") with this version that adds Shape B assertions:

```ts
it("renders generated tests and preserves the manual region", () => {
  const config = defineConfig({
    storybookUrl: "http://localhost:6060",
    storyGlobs: ["components/**/__stories__/*.stories.tsx"],
    resolveSpecPath: ({ storyFilePath }) =>
      storyFilePath
        .replace("/__stories__/", "/__screenshots__/")
        .replace(".stories.tsx", ".screenshots.spec.ts"),
  });

  const content = renderScreenshotSpec({
    config,
    title: "Button",
    stories: [
      { id: "button--default", name: "Default" },
      { id: "button--warning", name: "Warning" },
    ],
    manualRegion:
      "test('hover', async ({ sharedPage }) => { await expect(sharedPage).toHaveScreenshot(); });",
  });

  expect(content).toContain("import { test, expect, switchStory } from '@crvy/strybk'");
  expect(content).toContain("test.describe('Button'");
  expect(content).toContain("async ({ sharedPage, creevey })");
  expect(content).toContain("creevey.params('button--default')");
  expect(content).toContain("test.skip(skip, reason)");
  expect(content).toContain("await switchStory(sharedPage, 'button--default')");
  expect(content).toContain(
    "const target = captureElement ? sharedPage.locator(captureElement) : sharedPage",
  );
  expect(content).toContain("mask: ignoreElements.map((selector) => sharedPage.locator(selector))");
  expect(content).toContain("// @generated-end auto-screenshots");
  expect(content).toContain("test('hover'");
});
```

Leave the second `it(...)` ("falls back to auto-screenshots markers when generatedRegionName is absent") unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/generate.test.ts`
Expected: FAIL — the new `expect(...).toContain(...)` assertions miss because the body still emits `await expect(sharedPage).toHaveScreenshot();`

- [ ] **Step 3: Write minimal implementation**

Replace the body of `renderScreenshotSpec` in `src/generate/render.ts`. The full new file:

```ts
import type { StrybkConfig } from "../config.js";

export interface RenderableStory {
  id: string;
  name: string;
}

const escapeSingleQuotes = (value: string): string => value.replace(/'/gu, "\\'");

const renderTest = (story: RenderableStory): string =>
  [
    `  test('${escapeSingleQuotes(story.name)}', async ({ sharedPage, creevey }) => {`,
    `    const { skip, reason, captureElement, ignoreElements } = creevey.params('${story.id}');`,
    `    test.skip(skip, reason);`,
    `    await switchStory(sharedPage, '${story.id}');`,
    `    const target = captureElement ? sharedPage.locator(captureElement) : sharedPage;`,
    `    await expect(target).toHaveScreenshot({`,
    `      mask: ignoreElements.map((selector) => sharedPage.locator(selector)),`,
    `    });`,
    `  });`,
  ].join("\n");

export function renderScreenshotSpec(args: {
  config: StrybkConfig;
  title: string;
  stories: RenderableStory[];
  manualRegion: string;
}): string {
  const generatedRegionName = args.config.generatedRegionName ?? "auto-screenshots";
  const tests = args.stories.map(renderTest).join("\n\n");

  return `import { test, expect, switchStory } from '@crvy/strybk';\n\n// @generated-begin ${generatedRegionName}\ntest.describe('${escapeSingleQuotes(args.title)}', () => {\n${tests}\n});\n// @generated-end ${generatedRegionName}\n\n${args.manualRegion}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/generate.test.ts`
Expected: PASS (the `renderScreenshotSpec` block passes; the `generateScreenshots` block still passes — it does not assert the screenshot line)

- [ ] **Step 5: Commit**

```bash
bun run format
git add src/generate/render.ts tests/generate.test.ts
git commit -m "feat: render captureElement/skip-aware generated tests"
```

---

## Task 6: `fixtures.ts` — worker story cache + `creevey` fixture

**Files:**

- Modify: `src/playwright/fixtures.ts`

Note: this task is glue wiring around `extractStories` and `resolveCreeveyStory` (both unit-tested in Tasks 3–4). It is validated end-to-end by a manual run against Storybook; there is no new automated test in this task.

- [ ] **Step 1: Add imports**

In `src/playwright/fixtures.ts`, replace the existing import block (the `@playwright/test` import and the `../config.js` / `../storybook/channelDriver.js` / `./runtime.js` imports) with:

```ts
import type {
  Page,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestInfo,
  TestType,
} from "@playwright/test";

import type { StorybookGlobals } from "../config.js";
import { createChannelDriver } from "../storybook/channelDriver.js";
import type {
  CreeveyApi,
  NormalizedCreeveyParams,
  StoriesRaw,
} from "../storybook/creeveyParams.js";
import { resolveCreeveyStory } from "../storybook/creeveyParams.js";
import { extractStories } from "../storybook/extract.js";
import { loadPlaywrightTestRuntime } from "./runtime.js";
```

- [ ] **Step 2: Extend the fixture type declarations**

Replace the existing `StrybkFixtures` and `StrybkWorkerFixtures` type declarations:

```ts
type StrybkFixtures = {
  sharedPage: Page;
  creevey: CreeveyApi;
};

type StrybkWorkerFixtures = {
  _workerPage: Page;
  _stories: StoriesRaw;
};
```

- [ ] **Step 3: Add the worker-scoped story cache**

In the `base.extend<StrybkFixtures, StrybkWorkerFixtures>({ ... })` call, add a new `_stories` worker fixture immediately after the `_workerPage` fixture entry (before `sharedPage`):

```ts
    _stories: [
      async ({ _workerPage }, use): Promise<void> => {
        const stories = await extractStories(_workerPage);
        await use(stories);
      },
      { scope: "worker" },
    ],
```

- [ ] **Step 4: Add the test-scoped `creevey` fixture**

Add the `creevey` fixture inside the same `extend` call, immediately after the `sharedPage` fixture:

```ts
    creevey: async ({ _stories }, use, testInfo): Promise<void> => {
      const browser = testInfo.project.name;
      const api: CreeveyApi = {
        params: (storyId: string): NormalizedCreeveyParams => resolveCreeveyStory(_stories, storyId, browser),
      };

      await use(api);
    },
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors). The pre-existing `_workerPage` and `sharedPage` fixtures are unchanged; `_stories` depends on `_workerPage`, and `creevey` depends on `_stories`.

- [ ] **Step 6: Commit**

```bash
bun run format
git add src/playwright/fixtures.ts
git commit -m "feat: add creevey fixture and worker story cache"
```

---

## Task 7: Remove generate-time source-parsing and `metadataExtractors`

**Files:**

- Modify: `src/generate/index.ts`
- Modify: `src/config.ts`
- Modify: `tests/generate.test.ts`
- Delete: `src/generate/metadata.ts`
- Delete: `tests/metadata.test.ts`

- [ ] **Step 1: Rewrite `src/generate/index.ts`**

Replace the entire file with:

```ts
import type { StrybkConfig } from "../config.js";

import { discoverStoryFiles, type StoryFile } from "./discover.js";
import { renderScreenshotSpec } from "./render.js";

export interface StoryIndexEntry {
  id: string;
  title: string;
  name: string;
  importPath: string;
  exportName?: string;
}

const normalizePath = (value: string): string => value.replace(/\\/gu, "/").replace(/^\.\//u, "");

const matchesByImportPath = (filePath: string, importPath: string): boolean => {
  const normalizedImport = normalizePath(importPath);
  const normalizedFile = normalizePath(filePath);

  return normalizedFile === normalizedImport || normalizedFile.endsWith(`/${normalizedImport}`);
};

const resolveStoryTitle = (
  storyFile: StoryFile,
  indexEntries: StoryIndexEntry[],
): string | null => {
  const pathMatch = indexEntries.find((entry) =>
    matchesByImportPath(storyFile.filePath, entry.importPath),
  );

  return pathMatch?.title ?? null;
};

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export async function generateScreenshots(args: {
  config: StrybkConfig;
  indexEntries: StoryIndexEntry[];
  readExistingFile?: (filePath: string) => string | null;
  configDir?: string;
}): Promise<Array<{ outputPath: string; content: string }>> {
  const storyFiles = await discoverStoryFiles(
    args.config.storyGlobs,
    args.configDir === undefined ? {} : { cwd: args.configDir },
  );
  const generatedRegionName = args.config.generatedRegionName ?? "auto-screenshots";
  const manualRegionPattern = new RegExp(
    `// @generated-end ${escapeForRegExp(generatedRegionName)}\\s*([\\s\\S]*)$`,
    "u",
  );

  return storyFiles.flatMap((storyFile) => {
    const title = resolveStoryTitle(storyFile, args.indexEntries);

    if (title === null) {
      return [];
    }

    const stories = args.indexEntries.filter((entry) => entry.title === title);
    const outputPath = args.config.resolveSpecPath({ storyFilePath: storyFile.filePath });
    const existing = args.readExistingFile?.(outputPath) ?? null;
    const manualRegion = existing?.match(manualRegionPattern)?.[1]?.trim() ?? "";

    if (stories.length === 0 && manualRegion.length === 0) {
      return [];
    }

    return [
      {
        outputPath,
        content: renderScreenshotSpec({
          config: args.config,
          title,
          stories,
          manualRegion,
        }),
      },
    ];
  });
}
```

This removes: the `readFileSync` import, the `metadata.js` import, `toStoryIdSegment`, `isStorySkipped`, `FILE_POLICY_KEY`, and all skip-filtering. Every index entry for the file's title now emits a test.

- [ ] **Step 2: Remove `metadataExtractors` from `src/config.ts`**

Replace the full contents of `src/config.ts` with:

```ts
export interface StorybookGlobals {
  [key: string]: string | number | boolean | null | undefined;
}

export interface StrybkConfig {
  storybookUrl: string;
  storyGlobs: string[];
  resolveSpecPath: (args: { storyFilePath: string }) => string;
  generatedRegionName?: string;
  deleteOrphans?: boolean;
}

export function defineConfig(config: StrybkConfig): StrybkConfig {
  return {
    generatedRegionName: "auto-screenshots",
    deleteOrphans: true,
    ...config,
  };
}
```

- [ ] **Step 3: Delete the source-parsing modules**

```bash
git rm src/generate/metadata.ts tests/metadata.test.ts
```

- [ ] **Step 4: Update `tests/generate.test.ts`**

Delete these four `it(...)` blocks inside `describe("generateScreenshots", ...)` (find them by their exact titles):

- `"keeps an output entry for an existing spec when creevey metadata filters out every story"`
- `"keeps an output entry for an existing spec when file-level creevey metadata filters out every story"`
- `"filters per-story creevey skips by story id when Storybook index entries omit exportName"`
- `"omits a fully skipped existing spec when no manual region remains"`

Then add this new case inside `describe("generateScreenshots", ...)`:

```ts
it("emits a test for every story regardless of creevey skip in source", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "strybk-generate-"));
  temporaryDirectories.push(tempDir);

  const storyFilePath = join(tempDir, "components", "__stories__", "Button.stories.tsx");
  mkdirSync(dirname(storyFilePath), { recursive: true });
  writeFileSync(
    storyFilePath,
    [
      "export default { title: 'Button' };",
      "export const Default = {};",
      "Default.parameters = { creevey: { skip: true } };",
    ].join("\n"),
  );

  const config = defineConfig({
    storybookUrl: "http://localhost:6060",
    storyGlobs: [join(tempDir, "components", "**", "*.stories.tsx")],
    resolveSpecPath: ({ storyFilePath: inputPath }) =>
      inputPath
        .replace("/__stories__/", "/__screenshots__/")
        .replace(".stories.tsx", ".screenshots.spec.ts"),
  });

  const outputs = await generateScreenshots({
    config,
    indexEntries: [
      {
        id: "button--default",
        title: "Button",
        name: "Default",
        exportName: "Default",
        importPath: "./components/__stories__/Button.stories.tsx",
      },
    ],
    readExistingFile: () => null,
  });

  expect(outputs).toHaveLength(1);
  expect(outputs[0]?.content).toContain("await switchStory(sharedPage, 'button--default')");
});
```

This proves source-parsing is gone: the story is still emitted (skip is now runtime).

- [ ] **Step 5: Run tests**

Run: `bun test tests/generate.test.ts`
Expected: PASS (all remaining cases — configDir resolution, auto-titles, orphan files, manual-region, and the new regression case)

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/generate/index.ts src/config.ts tests/generate.test.ts
git commit -m "refactor!: drop generate-time creevey source-parsing"
```

(The `git rm` from Step 3 is staged automatically.)

---

## Task 8: README + full check

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Document the new behavior**

In `README.md`, after the "Minimal `strybk.config.ts`" code block (end of the CLI section), add a new section:

```markdown
## Generated tests

Each generated spec renders a Playwright test per story. At runtime, `parameters.creevey` (read from the running Storybook, merged across global / kind / story levels) drives capture and skip behavior — no Storybook addon required:

- `captureElement: '<selector>'` — captures `page.locator('<selector>')`.
- `captureElement: null` (or unset) — captures the viewport.
- `skip: { '<reason>': { in, kinds, stories } }` — marks the test skipped with `<reason>`; `in` matches the Playwright project name.
- `ignoreElements: '<selector>' | ['<selector>']` — masks those elements via `toHaveScreenshot({ mask })`.

Example:

\`\`\`ts
// stories/MyModal.stories.tsx
export default {
title: 'MyModal',
parameters: { creevey: { captureElement: '#storybook-root' } },
};

export const Default = {
parameters: { creevey: { ignoreElements: '.timestamp' } },
};
\`\`\`

**Prerequisites for running specs:** `@playwright/test` (peer dependency) and browser binaries (`npx playwright install`). The `crvy-strybk generate` command itself needs neither — only a running Storybook to fetch `index.json`.
```

- [ ] **Step 2: Run the full check**

Run: `bun run check`
Expected: all green (typecheck, lint, format:check, test:bun, knip, duplicates). If `knip` flags anything, address the specific unused symbol it names. If `format:check` fails, run `bun run format` and re-run `bun run check`.

- [ ] **Step 3: Commit**

```bash
bun run format
git add README.md
git commit -m "docs: document creevey capture/skip/ignoreElements and Playwright prerequisite"
```

---

## Self-Review (completed)

- **Spec coverage:** every spec section maps to a task — runtime resolution (T1–T4, T6), full unification of skip (T2–T3 + T7 removal), `metadataExtractors` removal (T7), Shape B template (T5), worker cache + fixture (T6), `ignoreElements` mask (T3 normalize + T5 render), Playwright-dependency doc (T8), migration (T7–T8). `delay`/`tests` correctly omitted per spec out-of-scope.
- **Placeholder scan:** no TBD/TODO; every code step contains real code; commands have expected output.
- **Type consistency:** `NormalizedCreeveyParams` field names (`skip`, `reason`, `captureElement`, `ignoreElements`) match across creeveyParams.ts (T3), the fixture return (T6), and the destructure in render.ts (T5). `CreeveyApi.params` signature consistent between T3, T6, and T5 usage. `StoriesRaw` imported from creeveyParams.js in both extract.js (T4) and fixtures.ts (T6).
