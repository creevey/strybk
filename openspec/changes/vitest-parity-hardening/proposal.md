# Proposal: vitest-parity-hardening

## Why

The Vitest Browser Mode runtime shipped in 0.0.8 only collects on vitest >= 4.1: generated specs call `test.describe`, but that method exists on `test.extend()`'s collector only in vitest 4.1+, and the declared peer range (`vitest >=4 <5`) asserts support that was never exercised below 4.1. On vitest 4.0.18, matrix.frontend's M6 spike collected 0 tests (`test.describe is not a function`) and 0 baselines, so the dual-runner contract could not be re-evaluated and Playwright stayed the committed runner. The same spike found `sharedPage`/locator gaps (`nth/hover/click/fill/dragTo`) blocking the ported interactive scenarios from running under Vitest.

## What Changes

- Vitest runtime bridges `test.describe` explicitly with vitest's own `describe` collector whenever `test.extend()`'s collector lacks it, so generated specs collect and run on every supported vitest 4.x, 4.0 included.
- Generated specs gain a package-owned `describe`: `import { describe, test, expect, switchStory } from '@crvy/strybk'`, with `describe(...)` replacing `test.describe(...)` nesting. The full generated vocabulary is then provided by `@crvy/strybk` in both runtimes instead of being inherited from the runner's collector — existing generated files keep working via the runtime bridge. Generated output change: consumers regenerate specs; suite names, test names, and baseline paths are unchanged.
- `StrybkLocator` gains the portable interaction subset: `click`, `dblClick`, `hover`, `fill`, `clear`, `press`, `type`, `nth`, `first`, `last`, nested `locator()`, and `dragTo` (delegating to vitest browser locators; `dragTo` maps to `dropTo`, whose playwright-provider options are Playwright's drag-and-drop options). README documents the subset and the APIs that stay Playwright-only (`sharedPage.mouse`, element assertions).
- Collector assembly is extracted into a pure module with an in-gate Bun test for the missing-`describe` fallback, and the manual browser harness checklist adds a run on the oldest supported vitest 4.x minor.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `vitest-browser-runtime`: generated specs become fully package-vocabulary (`describe` export), `test.describe` is guaranteed across supported vitest 4.x, `sharedPage`/`StrybkLocator` expose the portable interaction subset, and minimum-version support is covered by an in-gate unit test plus the harness checklist. This capability currently exists only as the delta spec in `openspec/changes/vitest-runtime-agnostic-tests/`; that change archives first.

## Impact

- `src/vitest/index.ts` plus a new pure collector module, `src/vitest/pageAdapter.ts`, `src/generate/render.ts`, and the Playwright runtime export (`describe`); `dist/` layout unchanged.
- `package.json`: no new exports, no dependency changes; peer range stays `vitest >=4 <5`, now actually supported.
- Tests: `tests/generate.test.ts` and `tests/cli.test.ts` expected output, new collector/adapter unit tests, harness checklist.
- Docs: README Vitest Browser Mode section (generated import shape, portable locator subset, version support).
- Consumers regenerate specs after the release (matrix.frontend: ~200 files, baselines untouched).

## Non-goals

- Full Playwright `Page`/`Locator` parity: `sharedPage.mouse`, `waitForLoadState`, web-first element assertions, and the rest of the Playwright surface stay Playwright-only. Interactive manual regions using them remain single-runner code.
- Making manual (non-generated) regions runner-neutral by force; only the documented subset is guaranteed.
- Vitest dev-mode Storybook, cross-runner baseline sharing, and rprtr-side scanner changes for the generated `toHaveScreenshot` call sites (separate rprtr change).
- Narrowing the vitest peer range or bumping the floor; 4.0.x is fixed, not dropped.
