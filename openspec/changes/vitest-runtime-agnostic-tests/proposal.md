## Why

Generated screenshot specs import `test`/`expect` from `@crvy/strybk`'s Playwright runtime, so `vitest run` cannot collect or execute them — consumers who adopted Vitest Browser Mode (e.g. for the `@crvy/rprtr` vitest reporter loop) must maintain a second, hand-written test tree. The generated code is already runner-neutral through the `@crvy/strybk` import surface; only the runtime module behind it is Playwright-bound.

## What Changes

- `@crvy/strybk`'s `.` export becomes dual-mode: a `browser` condition in `package.json` `exports` serves a Vitest Browser Mode runtime, Node keeps the Playwright runtime. Same specifier, detected by the module consumer's environment — no runner flag, no config changes.
- New Vitest runtime: embedded same-origin Storybook `<iframe>` adapter providing `test` (vitest `test.extend`), `sharedPage` (adapter over the iframe), `switchStory` (channel via `contentWindow`), `creevey` (params via `__STORYBOOK_PREVIEW__.extract()`), and an `expect` facade mapping `toHaveScreenshot` to `toMatchScreenshot` with Playwright-parity options (`scale: 'css'`, comparator threshold, mask).
- New `@crvy/strybk/vite` export: a Vite plugin that prefix-proxies a **built** Storybook origin into the Vitest dev server so the embedded iframe is same-origin.
- Browser/globals identity under Vitest flows through per-instance `provide` (`strybkBrowser`, `strybkGlobals`) read via `inject()`.
- The generator, CLI, and generated file bytes are unchanged; switching runners means running `vitest` instead of `playwright test` against the same specs.

## Capabilities

### New Capabilities

- `vitest-browser-runtime`: the dual-mode `.` export and the Vitest adapter (fixtures, story switching, runtime creevey params, screenshot assertion facade, browser/skip identity, viewport capture via the iframe element). Without it, `vitest run` on generated specs fails at import — Playwright's `test` cannot be collected by Vitest, and there is no in-browser path to the Storybook preview at all. Extends the existing in-page logic in `src/storybook/channelDriver.ts` and `src/storybook/extract.ts` (already runner-agnostic) and reuses `src/storybook/creeveyParams.ts` verbatim; a separate branch is needed because the Playwright fixtures in `src/playwright/fixtures.ts` are Node-side `Page` objects, unreachable from browser-mode test code.
- `storybook-vite-proxy`: the `@crvy/strybk/vite` plugin contract (prefix mount, target origin, built-Storybook scope). Without it the embedded iframe is cross-origin, `contentWindow` access is blocked by the browser, and runtime `parameters.creevey` resolution — the core no-addon design — is impossible under Vitest. No existing strybk surface serves Vite configs, hence a new export path.

### Modified Capabilities

None — no capability specs exist yet, and the generator/CLI emit byte-identical output.

## Non-goals

- Any generator, CLI, or `StrybkConfig` change (no `runner` switch; runner choice is which command you execute).
- Dev-mode Storybook under Vitest (vite-dev asset paths are absolute; scope is built `storybook build` output — Playwright keeps the dev loop).
- Portable-stories/`composeStory` rendering (Model B — stories imported as modules, no running Storybook).
- Cross-runner baseline sharing (each runner keeps its own baseline tree).
- rprtr-side changes (e.g. teaching its source scanner the facade's `toHaveScreenshot` call sites for passing-test previews) — separate change in the rprtr repo; the facade's deterministic story-derived screenshot names are chosen to make that possible later.
- A Storybook addon — params stay runtime-resolved via `extract()`.

## Impact

- `package.json`: `exports["."]` gains a `browser` condition; new `./vite` export; optional peer dependencies on `vitest`/`@vitest/browser-playwright` (Playwright peer dep unchanged); `dist/` gains the vitest runtime and plugin files.
- `src/`: new `src/vitest/` runtime branch; `src/playwright/` untouched; shared in-page logic stays in `src/storybook/`.
- `README.md`: "Generated tests" and "Prerequisites" sections gain the Vitest path (built Storybook + vite plugin + instance `provide` conventions).
