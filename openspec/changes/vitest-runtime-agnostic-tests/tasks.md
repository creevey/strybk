## 1. Shared in-page Storybook logic

- [x] 1.1 Write failing tests for plain in-page functions (story selection via channel with render/error/timeout settling, globals update, preview state extraction) against fake `window` objects, then extract the `page.evaluate` callback bodies from `src/storybook/channelDriver.ts` and `src/storybook/extract.ts` into exported runner-agnostic functions that the Playwright branch continues to invoke through `evaluate`. Verification: `bun test tests/channelDriver.test.ts && bun test tests/extract.test.ts && bun run typecheck`
- [ ] 1.2 Confirm the Playwright path is behaviorally unchanged after the extraction: existing fixture and switchStory suites pass unmodified. Verification: `bun test tests/playwright.fixtures.test.ts && bun test tests/switchStory.test.ts && bun run typecheck`

## 2. Vitest runtime branch

- [x] 2.1 Spike: verify Vitest Browser Mode honors the `browser` package export condition for test-file imports (throwaway scratch project outside the repo, throwaway entry module). Record the outcome next to this checkbox; the fallback path (single entry with `import.meta.env` detection) is design.md Decision 1's rejected alternative. Verification: `bun run typecheck`
  - Outcome (2026-09-18): VERIFIED with vitest 4.1.11 + @vitest/browser-playwright 4.1.11 (chromium, headless). Scratch project with `exports["."] = { "browser": "./browser.js", "default": "./node.js" }`: the browser-mode test import resolved the `browser` entry (test passed); `node`/`bun` resolved `default`. Note: vitest 4 requires the explicit provider — `provider: playwright()` imported from `@vitest/browser-playwright`. The `import.meta.env` fallback is not needed.
- [x] 2.2 Write failing tests asserting the published surface, then update `package.json`: `exports["."]` gains the `browser` condition pointing at the vitest entry, `./vite` export is added, and optional peer dependencies (`vitest >=4 <5`, `@vitest/browser-playwright >=4 <5`, `peerDependenciesMeta`) are declared. Verification: `bun test tests/package-surface.test.ts && bun run typecheck`
- [x] 2.3 Write failing tests for the pure assertion-translation layer, then implement it: test full-name → screenshot name (vitest's own sanitization scheme), `toHaveScreenshot` options → `toMatchScreenshot` options (`mask` mapping, `scale: "css"`, comparator threshold `0.2`), and viewport-capture targeting. Verification: `bun test tests/vitest-assertion.test.ts && bun run typecheck`
- [x] 2.4 Write failing tests for the preview-iframe orchestration's pure parts (iframe URL construction with story id and globals query, render-wait wiring against a fake window/channel, unreachable-preview error message naming the URL and the built-output requirement), then implement the embedded-iframe module with a file-scope cache. Verification: `bun test tests/vitest-preview-iframe.test.ts && bun run typecheck`
- [x] 2.5 Write failing tests for identity/globals resolution (provided `strybkBrowser`/`strybkGlobals` respected, `strybkBrowser` defaulting to `chromium`, absent globals a no-op), then implement the provide/inject layer. Verification: `bun test tests/vitest-identity.test.ts && bun run typecheck`
- [x] 2.6 Assemble `src/vitest/index.ts` exporting `test`, `expect`, and `switchStory` with the runner-neutral signatures the generated code uses (vitest `test.extend` fixtures, `expect` facade from 2.3, iframe adapter from 2.4, identity layer from 2.5). Verification: `bun run typecheck && bun run knip`

## 3. Vite proxy plugin

- [ ] 3.1 Write failing tests asserting the plugin's returned config (default `/storybook` prefix, configurable prefix and target origin, rewrite stripping the prefix), then implement `src/vite/` as a plain-object plugin with no `vite` runtime dependency. Verification: `bun test tests/vite-plugin.test.ts && bun run typecheck`
- [ ] 3.2 Write failing tests for the upstream-failure path (prefix request failing against the origin propagates the upstream status to the runtime's actionable error), then implement it. Verification: `bun test tests/vite-plugin.test.ts && bun run typecheck`

## 4. Manual browser harness

- [ ] 4.1 Build a manual harness outside the automated gate (scratch project: `storybook build` + static serve + vitest browser config with the plugin), and run the checklist: collection of generated specs, story switching and render-wait, runtime `parameters.creevey` resolution, skip `in:` matching via `strybkBrowser`, viewport capture via the iframe element, mask handling, first-run baseline write-and-fail, `vitest run --update` seeding, and pixel-dimension parity against a Playwright capture of the same story. Record results next to this checkbox. Verification: `bun run typecheck`

## 5. Docs and full gate

- [ ] 5.1 Update `README.md`: add a Vitest Browser Mode section (built Storybook requirement, plugin wiring, instance `provide` conventions, prefix reservation, first-run baseline behavior, dev-loop stays on Playwright, dual-runner discovery note) and extend Prerequisites. Verification: `bun run format:check`
- [ ] 5.2 Run the full gate and fix anything it surfaces (lint, typecheck, format, knip, tests, duplication, publint). Verification: `bun run check`
