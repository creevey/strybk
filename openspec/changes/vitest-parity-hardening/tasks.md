## 1. Version-independent test collector

- [x] 1.1 Write failing tests for the collector assembly in `tests/vitest-collector.test.ts` (fake collector without `describe` gets the fallback; a collector with `describe` keeps it; the `skip` override wins; remaining own members are copied), then implement `src/vitest/collector.ts` with no `vitest` import. Verification: `bun test tests/vitest-collector.test.ts && bun run typecheck`
- [x] 1.2 Wire `src/vitest/index.ts` to the assembly and export `describe` from `vitest`, keeping the `test.skip(condition, reason)` bridge unchanged. Verification: `bun run typecheck && bun run knip`

## 2. Package-owned describe export and generated output

- [x] 2.1 Extend `tests/playwright.test.ts` to assert the Playwright runtime exports a callable `describe` bound to `test.describe`, then export it from `src/playwright/index.ts` and `src/index.ts`. Verification: `bun test tests/playwright.test.ts && bun run typecheck`
- [x] 2.2 Update expected generated output in `tests/generate.test.ts` and `tests/cli.test.ts` to the new import line (`describe, test, expect, switchStory`) and `describe(...)` nesting; watch them fail, then implement the renderer change in `src/generate/render.ts`. Verification: `bun test tests/generate.test.ts && bun test tests/cli.test.ts && bun run typecheck`

## 3. Portable locator subset

- [x] 3.1 Write failing tests for the portable locator adapter in `tests/vitest-locator.test.ts` against a fake vitest locator (each method delegates with options; `nth`/`first`/`last` re-wrap; `locator()` scopes through `getByCSS`; `dragTo` maps to `dropTo` with Playwright-style positions), then implement `src/vitest/locatorAdapter.ts` as a types-only factory. Verification: `bun test tests/vitest-locator.test.ts && bun run typecheck`
- [x] 3.2 Wire `StrybkPageAdapter.locator()` to the factory, keep `isStrybkLocator` recognizing nested/`nth` results, and confirm masks and capture targets still resolve. Verification: `bun test tests/vitest-page-adapter.test.ts && bun test tests/vitest-assertion.test.ts && bun run typecheck`

## 4. Minimum-version browser harness

- [x] 4.1 Rebuild strybk, regenerate the harness spec, and run the manual harness on the oldest supported vitest 4.x minor with the full checklist: `describe` collection, capture dimensions, mask, skip identity, `waitForTimeout`, and the `dragTo` scenario. Record results next to this checkbox (harness lives outside the repo). Verification: `bun run typecheck`
  - Results (2026-09-22, scratch project: storybook 9 web-components-vite build + python static server on 6007, vitest 4.0.18 + @vitest/browser-playwright 4.0.18, chromium headless, local `crvy-strybk generate` against the built `index.json`):
    - Collection: 8/8 tests collected and passed — 6 generated tests nested with the package `describe`, plus a manual region nested with `test.describe`, which the 0.0.8 runtime could not collect on 4.0.x. The collector fallback works.
    - Capture dimensions: viewport baselines 1024×720; `captureElement` baseline 992×18. All passed against the baselines seeded under 4.1.11.
    - Mask: `With Mask` passed against the 4.1.11-seeded baseline.
    - Skip identity: with `provide: { strybkBrowser: "firefox" }` the story skipped with `[not under chromium]`; under chromium it runs.
    - `waitForTimeout`: the `delay: 300` story took 468ms vs ~150ms for peers.
    - `dragTo`: `.dragTo(target, { targetPosition: { x: 0, y: 0 } })` reached the drop target (`dataset.dropped === "true"`).
- [x] 4.2 Run the same harness on the current vitest 4.1.x to confirm no regression against the recorded 0.0.8 results. Record results next to this checkbox. Verification: `bun run typecheck`
  - Results (2026-09-22, same scratch project, vitest 4.1.11 + @vitest/browser-playwright 4.1.11): same 8/8 checklist pass — baselines seeded with `vitest run --update` then a clean run, dimensions and mask unchanged (1024×720 viewport, 992×18 element capture), skip identity skipped with `[not under chromium]` under `strybkBrowser: "firefox"`, delay 463ms, `dragTo` assertion passed. No regression against the recorded 0.0.8 results. The harness was left on vitest 4.1.11.

## 5. Docs, sequencing, and full gate

- [x] 5.1 Update `README.md`: generated import shape, the portable locator subset table with Playwright-only APIs (`sharedPage.mouse`, element assertions) and the `hover({ position })` replacement, and the tested vitest versions. Verification: `bun run format:check`
- [x] 5.2 Confirm `openspec/changes/vitest-runtime-agnostic-tests/` is archived before this change archives, then run `openspec validate vitest-parity-hardening --strict`. Verification: `openspec validate vitest-parity-hardening --strict`
- [x] 5.3 Full gate and fix anything it surfaces (lint, typecheck, format, knip, tests, duplication, publint). Verification: `bun run check`
