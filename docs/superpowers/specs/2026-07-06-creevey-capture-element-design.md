# Design: `creevey.captureElement` support (and unified runtime parameter resolution)

- **Date:** 2026-07-06
- **Status:** Approved
- **Scope:** `@crvy/strybk`

## Goal

Generate Playwright screenshot specs that honor `story.parameters.creevey.captureElement` — capturing a specific element instead of the viewport — while keeping generation static and dependency-light.

## Background

- **Creevey semantics** (`creevey/src/types.ts:549`, `docs/storybook.md`): `captureElement: string | null`. A CSS selector string captures that element; `null` captures the whole viewport. Default in creevey is `#storybook-root`. It is defined at global (`preview.ts`), kind (meta), or story level and **deeply merged by Storybook** for each story.
- **strybk today** (`src/generate/render.ts`): unconditionally emits `await expect(sharedPage).toHaveScreenshot();` — i.e. always captures the **viewport**. strybk's default therefore differs from creevey's (viewport vs. `#storybook-root`); `captureElement: null` in creevey already matches strybk's default.
- **`index.json` carries no parameters.** Verified against a built Storybook: a story entry has exactly `type, subtype, id, name, title, importPath, tags, exportName` — no `parameters`. Parameters are resolved by Storybook only at runtime, where it deep-merges global + kind + story.
- **How creevey gets merged params** (`creevey/src/playwright/setup.ts:20`, `shared/index.ts:19-28`, `playwright/generator.ts:339`): a browser step calls `window.__STORYBOOK_PREVIEW__.extract()`, then `denormalizeStoryParameters` deep-merges `globalParameters + kindParameters[title] + story.parameters` (lodash). Regexes are carried serialized and deserialized (`shared/index.ts:30-77`).
- **strybk's existing `skip` feature** parses `parameters.creevey.skip` from `.stories.tsx` source text at generate time via a regex extractor (`src/generate/metadata.ts`), gated behind `metadataExtractors: ["creevey"]`. It cannot see global `preview.ts`, and regex/array skip matching is best-effort.

## Decisions

1. **Runtime resolution.** Generated tests read merged `parameters.creevey` from the live Storybook at test time via `__STORYBOOK_PREVIEW__.extract()`. No browser at generate time; generation stays `index.json` + filesystem only. Runtime resolution needs no new environmental dependency — `switchStory` already requires a running Storybook.
2. **Full unification.** Both `captureElement` **and** `skip` resolve at runtime from the single merged-parameter source. This supersedes the generate-time source-parsing skip path, removing its accuracy gaps (global `preview.ts`, regex/array skip, `addParameters()`).
3. **Remove `metadataExtractors`.** Runtime resolution needs no opt-in. The field is removed from `StrybkConfig` and `defineConfig`; `src/generate/metadata.ts` is deleted; the generator no longer reads `.stories.tsx` contents (only file paths for spec-path mapping).

## Feature scope

Resolved at runtime from the full `parameters.creevey` bag:

| Parameter                            | Mapping                                                                      | Notes                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `captureElement: string \| null`     | `string` → `page.locator(sel)`; `null`/`undefined` → `sharedPage` (viewport) | **primary goal**                                              |
| `skip: SkipOptions`                  | Playwright `test.skip(skip, reason)`                                         | matches on `(browser, kind, name)`; regexes deserialized      |
| `ignoreElements: string \| string[]` | Playwright `toHaveScreenshot({ mask })`                                      | included — nearly free; avoids an arbitrary subset of the bag |

**Out of scope (YAGNI):** `delay`, `tests` (creevey sub-tests). strybk emits exactly one screenshot assertion per story.

**`browser` dimension for skip matching:** creevey's `in:` matches browser names defined in creevey's own config (e.g. `'chrome'`, `'ie11'`). strybk has no creevey-style browser config, so `in:` is matched against `testInfo.project.name`. Consequences: a Playwright project named `desktop-chrome` will not match `in: 'chrome'`. Consumers name their Playwright projects to line up with their `skip.in` rules (or scope skip rules by `kinds`/`stories` only). This differs from creevey and is documented as a known semantic gap; `kinds` (=`title`) and `stories` (=`name`) matching is unaffected.

**Default capture behavior:** `captureElement` undefined at every level → viewport (`expect(sharedPage)`), matching strybk's current default and the "capture element _instead of_ viewport" framing. A project-wide default (e.g. `#storybook-root`) is set in the consumer's `preview.ts` and honored automatically — **no new strybk config key**.

## Generated test shape (Shape B)

`__STORYBOOK_PREVIEW__.extract()` returns all stories with merged params in one call, so it runs **once per worker** and is cached. Each test does a synchronous lookup; skip is decided **before** `switchStory`.

```ts
import { test, expect, switchStory } from "@crvy/strybk";

// @generated-begin auto-screenshots
test.describe("Button", () => {
  test("Default", async ({ sharedPage, creevey }) => {
    const { skip, reason, captureElement, ignoreElements } = creevey.params("button--default");
    test.skip(skip, reason);
    await switchStory(sharedPage, "button--default");
    const target = captureElement ? sharedPage.locator(captureElement) : sharedPage;
    await expect(target).toHaveScreenshot({
      mask: ignoreElements.map((selector) => sharedPage.locator(selector)),
    });
  });
});
// @generated-end auto-screenshots
```

- `creevey.params(storyId)` is a synchronous cache lookup returning `{ skip: boolean, reason?: string, captureElement: string | null, ignoreElements: string[] }`.
- `test.skip(skip, reason)` — `skip` is always a real boolean from the resolver, so the condition form is safe (falsy → no-op). Skipped stories never reach `switchStory`.
- `target` — `captureElement` string → `page.locator(sel)`; `null`/`undefined` → `sharedPage`.
- `mask` — Playwright accepts an empty `mask` array as a no-op, so `{ mask }` is always passed. `ignoreElements` defaults to `[]`.
- `switchStory` stays explicit and exported (manual-region authors keep the familiar primitive).

## Components & data flow

### Module changes

| File                                       | Change                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config.ts`                            | Remove `metadataExtractors` from `StrybkConfig` + `defineConfig` defaults.                                                                                                                                                                                                                                                   |
| `src/generate/metadata.ts`                 | **Delete.** Source-parsing gone.                                                                                                                                                                                                                                                                                             |
| `src/generate/index.ts`                    | Remove all creevey metadata logic (`extractCreeveyMetadata`, `isStorySkipped`, `FILE_POLICY_KEY`, the `readFileSync` of story source). Every index entry with a matching story file emits a test — no filtering.                                                                                                             |
| `src/generate/render.ts`                   | New test-body template (Shape B): `creevey` fixture in the destructured args; staged `test.skip` → `switchStory` → `target` → `mask` body.                                                                                                                                                                                   |
| `src/storybook/creeveyParams.ts`           | **New, pure.** `isSerializedRegExp`/`deserializeRegExp`; `matchBy`; `shouldSkipByOption`/`shouldSkip` (ported from `creevey/server/utils.ts:61-106`); `normalizeCreeveyParams`; and `resolveCreeveyStory(storiesRaw, storyId, browserName)` — the pure core that the fixture delegates to (unit-testable without a browser). |
| `src/storybook/extract.ts`                 | **New, page-bound.** `extractStories(page): Promise<StoriesRaw>` — single `page.evaluate(() => window.__STORYBOOK_PREVIEW__.extract())`, returns `{ [id]: { title, name, parameters } }`.                                                                                                                                    |
| `src/playwright/fixtures.ts`               | Worker fixture caches `extractStories(_workerPage)` once after `restoreSharedPageBaseline`. New test-scoped `creevey` fixture exposes `{ params(storyId) }` over the cache + `testInfo.project.name`, delegating to `resolveCreeveyStory`.                                                                                   |
| `src/playwright/index.ts` / `src/index.ts` | No new exports — `creevey` is a fixture on `test`, not a separate import.                                                                                                                                                                                                                                                    |
| `tests/metadata.test.ts`                   | **Delete.**                                                                                                                                                                                                                                                                                                                  |
| `tests/creeveyParams.test.ts`              | **New** — pure unit tests (see Testing).                                                                                                                                                                                                                                                                                     |
| `tests/generate.test.ts`                   | Update: remove the 4 `metadataExtractors: ["creevey"]` configs (lines 141, 214, 288, 347) and skip-filtering expectations; assert the new render shape.                                                                                                                                                                      |

### Why split `creeveyParams.ts` (pure) from `extract.ts` (page-bound)

Skip matching and regex deserialization are pure functions with subtle semantics (AND across browser/kind/story, regex objects, reason extraction). Isolating them from `Page` lets the gnarly creevey logic be locked down by fast unit tests. `extract.ts` stays tiny (one evaluate) and is validated by an integration/manual pass against a running Storybook (the repo has no existing e2e harness).

### Data flow (per worker)

1. Worker starts → `_workerPage` fixture navigates to `/iframe.html`, waits for `#storybook-root` (existing), then calls `extractStories(page)` once and caches `StoriesRaw` in a worker-scoped variable.
2. Each test → `creevey` fixture reads the cached `StoriesRaw` + `testInfo.project.name`, exposes `params(storyId)`.
3. `creevey.params(storyId)` → `resolveCreeveyStory` looks up `{title, name, parameters.creevey}` → `normalizeCreeveyParams` + `shouldSkip` → `{ skip, reason, captureElement, ignoreElements }`.
4. Test body → `test.skip(...)` → `switchStory` → build `target`/`mask` → `expect(target).toHaveScreenshot({ mask })`.

### Error handling

- Story id missing from the cache (stale `index.json` vs. running Storybook) → `creevey.params` throws, naming the id.
- `extract()` returns empty/undefined → worker fixture throws "No stories extracted; is Storybook fully loaded?" (mirrors `creevey/src/playwright/setup.ts:22`).
- `__STORYBOOK_PREVIEW__` undefined → `extract.ts` throws "Storybook preview not available" (mirrors the existing channel-driver guard in `src/storybook/channelDriver.ts`).
- `captureElement` selector matches nothing in DOM → Playwright's `locator` + `toHaveScreenshot` already errors clearly; no extra handling.

## Playwright dependency

| Context                 | Playwright needed?     | Why                                                                                                                                                                                                 |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crvy-strybk generate`  | **No**                 | Generation only does HTTP fetch of `index.json` + filesystem globbing + text rendering.                                                                                                             |
| Running generated specs | **Yes** (pre-existing) | `loadPlaywrightTestRuntime()` (`src/playwright/runtime.ts:12`) already requires `@playwright/test` from the consumer's cwd and throws if missing; `@playwright/test` is already a `peerDependency`. |

The new `creevey` fixture and the `extract()` call happen at **test-run time**, reusing the already-loaded Playwright runtime — **no new dependency, no new failure mode**. This is a deliberate benefit of runtime resolution: the rejected generate-time-browser-extract alternative would have forced Playwright + a browser launch into `generate`, breaking "the generator runs anywhere with just Node/Bun + a running Storybook."

**If a user runs specs without Playwright locally:** `@playwright/test` missing → existing `loadPlaywrightTestRuntime()` error fires on first import of `@crvy/strybk/playwright`. Missing browser binaries → Playwright's own error guides them to `playwright install`. No code change; **documentation only** — README to add: "Running generated specs requires `@playwright/test` (peer dep) and browser binaries (`playwright install`)."

## Migration & backward compatibility

- **Re-running `generate`** rewrites the `// @generated-begin/end` region with the new Shape B body; the manual region is preserved (unchanged mechanism).
- **Baselines:** stories with no `captureElement` anywhere produce byte-identical viewport output → baselines unchanged. Stories that now resolve to a `captureElement` change their captured region → baseline re-approval needed (the intended effect).
- **Breaking config change:** `metadataExtractors` removed from `StrybkConfig`. TypeScript users get a compile error guiding them to delete the line; JS users have it silently dropped by the `defineConfig` spread. README migration note: "Remove `metadataExtractors` from your config; skip and captureElement now resolve automatically at runtime."
- **Behavioral change:** skipped stories now appear in specs as `test.skip(...)` (visible in Playwright reports as skipped) rather than being absent from the file. Accepted under full unification.
- **No longer read at generate time:** `.stories.tsx` contents are no longer opened (only file paths for spec-path mapping). `storyGlobs` + `resolveSpecPath` still required, unchanged.

## Testing

### Pure unit tests — `tests/creeveyParams.test.ts`

- `deserializeRegExp` / `isSerializedRegExp`: round-trip; non-regexp passthrough; mixed arrays.
- `shouldSkip` / `shouldSkipByOption`:
  - boolean shorthand (`true`/`false`) and string shorthand (reason).
  - object form across dimensions: `in` (string / array / deserialized regex), `kinds` (title), `stories` (name).
  - AND semantics — `{ in: 'chrome', stories: 'Default' }` matches only chrome + Default.
  - undefined dimension = match all; object key = reason; array of `SkipOption` = OR across entries.
- `normalizeCreeveyParams`:
  - no `creevey` key → `{ skip: false, captureElement: null, ignoreElements: [] }`.
  - `captureElement` string passthrough; `null` → null; absent → null.
  - `ignoreElements` string → `[sel]`; array → array; `null`/absent → `[]`.
  - `skipOptions` normalized against `(browser, title, name)` → `{ skip, reason }`.
- `resolveCreeveyStory(storiesRaw, storyId, browserName)`: end-to-end pure mapping, including a missing-id throw.

### Generator tests — `tests/generate.test.ts`

- Remove the four `metadataExtractors: ["creevey"]` configs and all skip-filtering expectations (every index entry with a matching file now emits a test — no filtering).
- `renderScreenshotSpec` assertions on the new body: `creevey` in destructured args, `creevey.params('<id>')`, `test.skip(skip, reason)`, `switchStory(...)`, `target`/`mask` lines.
- Keep the non-creevey cases (configDir glob resolution, auto-titles via importPath, orphan files dropped, manual-region preservation).

### Fixture/extract wiring

- The pure core (`resolveCreeveyStory`) is fully unit-tested above. `extract.ts` (the `page.evaluate`) and the fixture plumbing are validated by an integration/manual pass against a running Storybook; no new e2e harness is introduced in this scope.

## Out of scope / future

- `delay` and `tests` (creevey sub-tests) — deferred.
- A strybk config key for a project-wide default captureElement — unnecessary; the consumer's `preview.ts` is the default and is honored automatically.
- An e2e harness against a live Storybook for `extract.ts` — possible future hardening, not required for this change.

## Decisions log

| #   | Decision                                            | Alternatives rejected                                                                                                                                                       |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Runtime resolution of params                        | (A) source-parsing captureElement; (B) generate-time browser extract — both rejected (A can't see global preview.ts / accurate merges; B forces Playwright into `generate`) |
| 2   | Full unification (skip + captureElement at runtime) | captureElement-only (two parallel mechanisms); additive runtime skip (two code paths)                                                                                       |
| 3   | Remove `metadataExtractors`                         | deprecate-keep field (dead config); repurpose as gate (opt-in contradicts unified single source of truth)                                                                   |
| 4   | Shape B (explicit staged helpers, cached extract)   | Shape A (single orchestrating helper — rejected for transparency); Shape C (fixture-bound method)                                                                           |
| 5   | Default capture = viewport                          | align with creevey's `#storybook-root` (would silently change strybk's existing default behavior for all stories)                                                           |
