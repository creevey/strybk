# Nested Describe Titles — Design

## Problem

Generated specs emit a single flat `test.describe` whose title is the full Storybook kind title, e.g. `test.describe('Components/Комментарии/CommentLine', ...)`. Playwright's HTML reporter builds its tree from nested `describe` blocks and never splits flat titles on `/`, so long kind titles render as one awkward, wide node in the web UI.

## Goal

Render generated specs with one `test.describe` per title segment so the HTML reporter shows a proper collapsible hierarchy:

```ts
// @generated-begin auto-screenshots
test.describe("Components", () => {
  test.describe("Комментарии", () => {
    test.describe("CommentLine", () => {
      test("Comment line", async ({ sharedPage, creevey }) => {
        // unchanged body
      });
    });
  });
});
// @generated-end auto-screenshots
```

## Decisions

- **Always nested, no config flag.** The package is pre-1.0; nesting is strictly better output and becomes the only behavior. No `nestedDescribe` option is added.
- **Reporter-level fix rejected.** Playwright's HTML reporter derives hierarchy solely from suite nesting; it cannot be made to split flat titles.
- **Story names are never split.** Only the kind title is segmented; story names remain leaf test titles.

## Render Changes

All changes live in `src/generate/render.ts`:

- `renderTest` gains a `depth` parameter so test bodies indent correctly under nesting (2 spaces per level, consistent with existing formatting).
- New describe-wrapping step before `renderTest`: split the title with `title.split('/').map(s => s.trim()).filter(Boolean)`, escape each segment with the existing `escapeSingleQuotes`, and wrap the tests in nested `test.describe('<segment>', () => { ... })` blocks.
- The `@generated-begin` / `@generated-end` markers stay at the top level of the file, outside all describes.
- The manual region is unchanged: it already lives after `@generated-end`, so manually written top-level tests are unaffected.

## Edge Cases & Compatibility

- **Empty segments** (`A//B`, leading/trailing `/`) are dropped, mirroring Storybook's own title normalization.
- **Single-segment titles** (e.g. `Button`) render exactly as today: one `test.describe`, no extra nesting.
- **Snapshot filenames are unchanged.** Playwright derives anonymous snapshot names from `titlePath.slice(1).join(" ")` passed through `sanitizeForFilePath`, which collapses both `/` and spaces to `-` (verified in `playwright-core/lib/worker/testInfo.js` and `playwright-core/lib/server/utils/fileUtils.js:71`). Flat and nested paths sanitize to identical filenames, so regeneration requires no snapshot re-approval.
- **`--grep` semantics change.** Playwright greps against the space-joined title path, so patterns containing `/` (e.g. `--grep "Components/Комментарии"`) no longer match; users should grep by segment instead. This must be called out in the changelog entry.
- **Existing specs migrate automatically.** Regeneration replaces the generated region, so a single `crvy-strybk generate` run updates all specs.

## Testing

Unit tests in `tests/generate.test.ts`:

- Multi-segment title renders nested describes in order with correct indentation.
- Single-segment title output is unchanged from the current form.
- Empty segments are filtered (`A//B` → two describes).
- Manual region is still preserved after the generated region.
- Snapshot-name equivalence: emulate Playwright's sanitizer (`/`, spaces, and punctuation → `-`) over both the flat and nested title paths and assert identical filenames.

Verification: `bun run check` (lint + typecheck + tests).
