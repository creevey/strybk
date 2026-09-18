## Context

Today `src/index.ts` re-exports the Playwright runtime from `src/playwright/`; generated specs' only runner touchpoints are the `test`/`expect`/`switchStory` imports plus the `sharedPage`/`creevey` fixtures, all provided by that runtime. The in-page Storybook logic (`src/storybook/channelDriver.ts`, `src/storybook/extract.ts`, `src/storybook/creeveyParams.ts`) is already runner-agnostic — the Playwright branch invokes it through `page.evaluate`, from Node. Vitest Browser Mode flips the execution environment: test code runs inside Chromium, where `vitest/browser`'s `page` shim has no `goto()` and no `evaluate`, so the Node-side fixtures in `src/playwright/fixtures.ts` are unreachable. Verified constraints that shape the design: vitest's default include covers `*.spec.ts` (both runners discover the same files); browser instances accept per-instance `provide` readable via `inject()`; `@vitest/browser` 4.1.x exposes no public in-browser instance-name accessor; built Storybook emits relative asset URLs (`base: "./"` in builder-vite), while dev-mode Storybook serves absolute vite URLs.

## Goals / Non-Goals

**Goals:**

- Same generated spec files execute under `playwright test` (unchanged) and `vitest run` (new), with runner-parity capture semantics.
- Runtime `parameters.creevey` resolution under Vitest — no Storybook addon, no generate-time inlining.

**Non-Goals** (beyond proposal-level): no worker-scoped fixtures under Vitest (file-scope sharing suffices — worker scope would require `isolate: false` and change vitest's default isolation model); no cross-runner baseline sharing; no automated in-gate browser tests (repo tests stub network/browser by convention — browser-mode verification happens through a documented manual harness/example, mirroring how rprtr verifies via `examples/`).

## Decisions

### 1. Dual-mode `.` export via the `browser` package condition

`exports["."]` becomes `{ "browser": { "types": ..., "default": "./dist/src/vitest/index.js" }, "default": { "types": ..., "default": "./dist/src/index.js" } }`. Vite applies the `browser` condition when serving test files to Vitest Browser Mode; Node resolves `default` for `playwright test`. Alternatives rejected: runtime detection inside one entry (`import.meta.env.VITEST` / try-catch `import('vitest/browser')`) — a single entry would need top-level branching and must keep `node:*` imports out of the browser-transformed graph, all to reimplement what the bundler already resolves declaratively.

### 2. Shared in-page Storybook logic, extracted from evaluate callbacks

The `page.evaluate` callback bodies in `channelDriver.ts` and `extract.ts` become plain exported functions in `src/storybook/` taking a `window`-like object. The Playwright branch calls them via `evaluate`; the new Vitest branch calls them directly on the embedded iframe's `contentWindow`. This extends the existing modules rather than duplicating channel/extract logic per runner (`creeveyParams.ts` is reused verbatim — it is already pure).

### 3. Embedded preview iframe with file-scope reuse

The Vitest `sharedPage` fixture wraps a lazily-created `<iframe>` (module-level cache — one per spec file, matching vitest's per-file isolation) sized to the instance viewport, pointed at `<prefix>/iframe.html?id=<storyId>&viewMode=story`. `switchStory` navigates on first use and uses the Storybook channel (via `contentWindow`) for subsequent switches, preserving the Playwright path's shared-page/reset semantics. Worker-scoped fixtures were rejected (Decision in Non-Goals).

### 4. `@crvy/strybk/vite` proxy plugin, built-Storybook scope only

New module `src/vite/` (no existing module covers Vite integration): a plain-object plugin registering `server.proxy` for a configurable prefix (default `/storybook`) targeting the consumer's built-Storybook origin with prefix rewrite. Built output works because asset URLs are relative; dev-mode Storybook is documented unsupported (absolute vite dev paths collide with the vitest server's own namespaces — proxying them is not viable). The plugin needs no `vite` runtime dependency — it returns a config object; `vite` stays a dev-only type import, preserving the minimal runtime-dependency policy (`glob` remains the only runtime dep).

### 5. Assertion facade with deterministic, vitest-native naming

The Vitest `expect` wraps vitest's `expect.element(locator).toMatchScreenshot(name, options)`: `name` derives from the current test's full name (vitest's own auto-naming scheme — deterministic, and the shape rprtr's declaration scanner already mirrors), so no story id is threaded through `expect`. Options translation: `mask` entries become in-preview locators inside `screenshotOptions`; `scale: "css"` is pinned (vitest defaults to `scale: "device"`, which would double bitmap dimensions on DPR>1 displays and diverge from the Playwright path); comparator threshold pinned to the Playwright default (`0.2`). Viewport capture (`captureElement` unset) targets the iframe element's locator.

### 6. Browser identity and globals via per-instance `provide`

Vitest instances supply `provide: { strybkBrowser, strybkGlobals }`; the runtime reads them with `inject()` and applies globals through the channel (`updateGlobals`) before capture. `strybkBrowser` defaults to `chromium` (documented) — aligning with Playwright's default project name so `in: 'chromium'` rules mean the same in both runners. Rejected alternative: reading the instance name in-browser — no public accessor exists in `@vitest/browser` 4.1.x.

### 7. Peer dependencies stay optional additions

`peerDependencies` gains `vitest >=4 <5` and `@vitest/browser-playwright >=4 <5`, both `optional: true` in `peerDependenciesMeta`. The existing `@playwright/test` peer is untouched — the Playwright runtime is unchanged and remains the default path. No new runtime dependencies: the runner is the consumer's external surface, referenced only from the browser-condition branch.

## Risks / Trade-offs

- [Vitest Browser Mode might not honor the `browser` export condition for test-file imports] → Spike is the first implementation task; fallback is a single entry with `import.meta.env` detection (Decision 1's rejected alternative).
- [TypeScript resolves `.` types without the `browser` condition] → The declared `.d.ts` surface stays the runner-neutral signatures (generated code's entire vocabulary); both runtime branches must satisfy it. Consumers never see vitest-specific types through `.`.
- [Parity assumptions (scale, threshold, animations) unverified against real chromium] → Manual example harness verifies pixel dimensions against a Playwright capture before release; facade pins make drift explicit in one place.
- [Prefix collides with consumer routes under `/storybook`] → Prefix is a plugin option; README documents the reservation.
- [Per-story channel switching on a shared iframe diverges from per-story fresh navigation] → Keep Playwright-path semantics (channel + reset); revisit only if flakiness appears in the harness.
- [Passing visual tests lack rprtr baseline previews (facade call sites aren't `toMatchScreenshot` in test source)] → Accepted for now; deterministic full-name naming keeps a future rprtr scanner extension possible (separate rprtr change).

## Migration Plan

1. Additive-only release: new `browser`/`./vite` exports, optional peers. Existing consumers see no change (Node path byte-identical).
2. README gains a "Vitest Browser Mode" section: `storybook build` + static serve, plugin wiring, instance `provide` conventions, first-run baseline behavior (`vitest run --update`).
3. Rollback: revert the release — no persisted state, no config format consumed by the generator, baselines are per-runner trees.

## Open Questions

- Whether the `.` `types` entry should point at a dedicated neutral-signature `.d.ts` rather than today's Playwright-derived declarations — answerable during implementation without changing specs or task order.
