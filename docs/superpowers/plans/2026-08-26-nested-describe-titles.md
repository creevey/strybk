# Nested Describe Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render generated screenshot specs with one nested `test.describe` per Storybook title segment so Playwright's HTML reporter shows a collapsible tree instead of one long flat title.

**Architecture:** The change is confined to the spec renderer (`src/generate/render.ts`). `renderTest` gains a `depth` parameter for indentation; a new `wrapInDescribes` helper nests one `test.describe` per non-empty title segment. Everything downstream (CLI writing, manual-region extraction via the `@generated-end` regex, snapshot naming) is unaffected because the region markers stay at the top level and Playwright sanitizes flat and nested title paths to identical snapshot filenames.

**Tech Stack:** TypeScript (ESM), Bun as test runner (`bun test`), vitest-style tests in `tests/`, oxlint/oxfmt for lint/format.

**Spec:** `docs/superpowers/specs/2026-08-26-nested-describe-titles-design.md`

## Global Constraints

- Always nested — no config flag, no behavior toggle (spec: "Decisions").
- Only the kind title is split on `/`; story names are never split.
- Generated-region markers (`// @generated-begin` / `// @generated-end <name>`) stay at the top level, outside all describes.
- Single-segment titles must render byte-identical to the current output.
- Empty title segments (`A//B`, leading/trailing `/`) are dropped: `title.split("/").map(s => s.trim()).filter(Boolean)`.
- Indentation is 2 spaces per nesting level, matching existing output style.
- Each segment (and story name) is escaped with the existing `escapeSingleQuotes`.
- Snapshot filenames must not change (verified invariant; covered by a test).
- No comments in source code (repo convention).
- Commit messages follow conventional commits (`feat:`, `docs:`, etc. — git-cliff generates the changelog from them).

---

### Task 1: Nested describe rendering

**Files:**

- Modify: `src/generate/render.ts` (whole file is ~33 lines; rewrite as shown)
- Modify: `tests/generate.test.ts` (add tests to the `renderScreenshotSpec` describe block around line 20; update the auto-titles expectation at line 201)

**Interfaces:**

- Consumes: `StrybkConfig` from `../config.js` (unchanged).
- Produces: `renderScreenshotSpec(args)` and `RenderableStory` with unchanged signatures — `src/generate/index.ts` and `tests/generate.test.ts` call them unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/generate.test.ts`, add these three tests inside the existing `describe("renderScreenshotSpec", ...)` block (after the "falls back to auto-screenshots markers" test, around line 77):

```ts
it("renders one nested describe per title segment", () => {
  const config = defineConfig({
    storybookUrl: "http://localhost:6060",
    storyGlobs: ["components/**/__stories__/*.stories.tsx"],
    resolveSpecPath: ({ storyFilePath }) => storyFilePath.replace(".stories.tsx", ".spec.ts"),
  });

  const content = renderScreenshotSpec({
    config,
    title: "Components/Комментарии/CommentLine",
    stories: [
      { id: "components-комментарии-commentline--comment-line-story", name: "Comment line" },
    ],
    manualRegion: "",
  });

  expect(content).toBe(
    [
      "import { test, expect, switchStory } from '@crvy/strybk';",
      "",
      "// @generated-begin auto-screenshots",
      "test.describe('Components', () => {",
      "  test.describe('Комментарии', () => {",
      "    test.describe('CommentLine', () => {",
      "      test('Comment line', async ({ sharedPage, creevey }) => {",
      "        const { skip, reason, captureElement, ignoreElements } = creevey.params('components-комментарии-commentline--comment-line-story');",
      "        test.skip(skip, reason);",
      "        await switchStory(sharedPage, 'components-комментарии-commentline--comment-line-story');",
      "        const target = captureElement ? sharedPage.locator(captureElement) : sharedPage;",
      "        await expect(target).toHaveScreenshot({",
      "          mask: ignoreElements.map((selector) => sharedPage.locator(selector)),",
      "        });",
      "      });",
      "    });",
      "  });",
      "});",
      "// @generated-end auto-screenshots",
      "",
      "",
    ].join("\n"),
  );
});

it("drops empty title segments", () => {
  const config = defineConfig({
    storybookUrl: "http://localhost:6060",
    storyGlobs: ["components/**/__stories__/*.stories.tsx"],
    resolveSpecPath: ({ storyFilePath }) => storyFilePath.replace(".stories.tsx", ".spec.ts"),
  });

  const content = renderScreenshotSpec({
    config,
    title: "Components//CommentLine/",
    stories: [{ id: "components-commentline--default", name: "Default" }],
    manualRegion: "",
  });

  expect(content).toContain("test.describe('Components', () => {");
  expect(content).toContain("  test.describe('CommentLine', () => {");
  expect(content).toContain("    test('Default', async ({ sharedPage, creevey }) => {");
  expect(content).not.toContain("describe('',");
});
```

Also add the snapshot-name invariant test at the top level of the file (after the `temporaryDirectories` cleanup block, before `describe("renderScreenshotSpec", ...)`), emulating Playwright's anonymous-snapshot naming (`titlePath.slice(1).join(" ")` through `sanitizeForFilePath` from `playwright-core/lib/server/utils/fileUtils.js:71`):

```ts
const sanitizeForSnapshotName = (titlePath: string[]): string =>
  titlePath.join(" ").replace(/[\x00-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/gu, "-");

describe("snapshot name invariants", () => {
  it("keeps anonymous snapshot names identical between flat and nested describes", () => {
    const flat = sanitizeForSnapshotName(["Components/Комментарии/CommentLine", "Comment line"]);
    const nested = sanitizeForSnapshotName([
      "Components",
      "Комментарии",
      "CommentLine",
      "Comment line",
    ]);

    expect(nested).toBe(flat);
    expect(nested).toBe("Components-Комментарии-CommentLine-Comment-line");
  });
});
```

Finally, update the existing expectation in the "generates specs for stories that rely on Storybook auto-titles via importPath" test (~line 201) from:

```ts
expect(outputs[0]?.content).toContain("test.describe('Components/Button'");
```

to:

```ts
expect(outputs[0]?.content).toContain("test.describe('Components', () => {");
expect(outputs[0]?.content).toContain("  test.describe('Button', () => {");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/generate.test.ts`
Expected: FAIL — the nested-describe test fails (output still contains the flat `test.describe('Components/Комментарии/CommentLine', ...)`), and the updated auto-titles expectation fails on `test.describe('Components/Button'`. The `snapshot name invariants` and `drops empty title segments`-marker tests may pass already (they don't depend on the renderer; the invariant test is documentation of an external property).

- [ ] **Step 3: Implement nested rendering in `src/generate/render.ts`**

Replace the file content with:

```ts
import type { StrybkConfig } from "../config.js";

export interface RenderableStory {
  id: string;
  name: string;
}

const escapeSingleQuotes = (value: string): string => value.replace(/'/gu, "\\'");

const splitTitleSegments = (title: string): string[] =>
  title
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const renderTest = (story: RenderableStory, depth: number): string => {
  const indent = "  ".repeat(depth);

  return [
    `${indent}test('${escapeSingleQuotes(story.name)}', async ({ sharedPage, creevey }) => {`,
    `${indent}  const { skip, reason, captureElement, ignoreElements } = creevey.params('${story.id}');`,
    `${indent}  test.skip(skip, reason);`,
    `${indent}  await switchStory(sharedPage, '${story.id}');`,
    `${indent}  const target = captureElement ? sharedPage.locator(captureElement) : sharedPage;`,
    `${indent}  await expect(target).toHaveScreenshot({`,
    `${indent}    mask: ignoreElements.map((selector) => sharedPage.locator(selector)),`,
    `${indent}  });`,
    `${indent}});`,
  ].join("\n");
};

const wrapInDescribes = (segments: string[], tests: string, depth: number): string => {
  const indent = "  ".repeat(depth);
  const [segment, ...rest] = segments;

  if (segment === undefined) {
    return tests;
  }

  return [
    `${indent}test.describe('${escapeSingleQuotes(segment)}', () => {`,
    wrapInDescribes(rest, tests, depth + 1),
    `${indent}});`,
  ].join("\n");
};

export function renderScreenshotSpec(args: {
  config: StrybkConfig;
  title: string;
  stories: RenderableStory[];
  manualRegion: string;
}): string {
  const generatedRegionName = args.config.generatedRegionName ?? "auto-screenshots";
  const segments = splitTitleSegments(args.title);
  const tests = args.stories.map((story) => renderTest(story, segments.length)).join("\n\n");
  const body = wrapInDescribes(segments, tests, 0);

  return `import { test, expect, switchStory } from '@crvy/strybk';\n\n// @generated-begin ${generatedRegionName}\n${body}\n// @generated-end ${generatedRegionName}\n\n${args.manualRegion}`;
}
```

Notes for the implementer:

- Single-segment titles: `segments = ['Button']`, tests render at `depth = 1` — output is byte-identical to the previous implementation, so the existing "renders generated tests and preserves the manual region" and "Button" expectations must keep passing unchanged.
- An all-slashes title (cannot occur from a real Storybook index) degrades to flat, unindented tests inside the markers — acceptable, no special handling.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/generate.test.ts`
Expected: PASS — all tests in the file, including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/generate/render.ts tests/generate.test.ts
git commit -m "feat!: nest one describe per story title segment

Generated specs now emit nested test.describe blocks for each '/'
separated title segment so the Playwright HTML reporter shows a
collapsible tree. Snapshot filenames are unchanged. --grep patterns
containing '/' no longer match; grep by a single segment instead."
```

(Do not push.)

---

### Task 2: Document the reporter/grep change and run full checks

**Files:**

- Modify: `README.md` (the "Generated tests" section, lines ~39-62)

**Interfaces:**

- Consumes: nothing from Task 1's code; documents its behavior.
- Produces: user-facing documentation of the nesting and the `--grep` caveat.

- [ ] **Step 1: Add the nesting note to README**

In `README.md`, in the "Generated tests" section, insert this paragraph immediately after the intro sentence ("Each generated spec renders a Playwright test per story. ... — no Storybook addon required:") and before the `captureElement` bullet list:

```markdown
Generated suites nest one `test.describe` per title segment — `Components/Button` becomes `describe('Components') > describe('Button')` — so the Playwright HTML reporter shows a collapsible tree. Snapshot filenames are unaffected. Note that `--grep` patterns containing `/` no longer match (Playwright greps the space-joined title path); grep by a single segment instead, e.g. `--grep CommentLine`.
```

- [ ] **Step 2: Run the full check suite**

Run: `bun run check`
Expected: all checks pass (lint, format:check, typecheck, tests, plus repo-specific knip/jscpd if included in `scripts/check.sh`). If format fails on files this plan touched, run `bunx oxfmt --write <file> --ignore-path=.oxfmtignore` and re-run `bun run check`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: note nested describes and --grep caveat"
```

(Do not push.)

---

## Self-Review Checklist (already applied)

- **Spec coverage:** nested rendering + edge cases + snapshot invariant → Task 1; `--grep` changelog callout → Task 1 commit body + Task 2 README; regeneration/migration → automatic (no task needed, `crvy-strybk generate` rewrites the generated region); single-segment unchanged → existing tests kept green in Task 1 Step 3 notes.
- **Placeholders:** none — every step has complete code/commands.
- **Type consistency:** `renderTest(story, depth)` and `wrapInDescribes(segments, tests, depth)` signatures used identically in Step 1 (implicitly, via exact expected output) and Step 3.
