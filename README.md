# @crvy/strybk

Generator-first Playwright screenshot testing for Storybook.

## Installation

```sh
npm install --save-dev @crvy/strybk
```

## CLI

Generate screenshot specs from a Storybook index:

```sh
crvy-strybk generate --config ./strybk.config.ts
```

Use `--dry-run` to compute outputs without writing files:

```sh
crvy-strybk generate --config ./strybk.config.ts --dry-run
```

The config module should export a `StrybkConfig` object, typically as the default export from `defineConfig(...)`.

Minimal `strybk.config.ts`:

```ts
import { defineConfig } from "@crvy/strybk";

export default defineConfig({
  storybookUrl: "http://localhost:6006",
  storyGlobs: ["src/**/*.stories.tsx"],
  resolveSpecPath: ({ storyFilePath }) => storyFilePath.replace(/\.stories\.tsx$/, ".spec.ts"),
});
```

## Generated tests

Each generated spec renders a Playwright test per story. At runtime, `parameters.creevey` (read from the running Storybook, merged across global / kind / story levels) drives capture and skip behavior — no Storybook addon required:

Generated suites nest one `test.describe` per title segment — `Components/Button` becomes `describe('Components') > describe('Button')` — so the Playwright HTML reporter shows a collapsible tree. Snapshot filenames are unaffected. Note that `--grep` patterns containing `/` no longer match (Playwright greps the space-joined title path); grep by a single segment instead, e.g. `--grep CommentLine`.

- `captureElement: '<selector>'` — captures `page.locator('<selector>')`.
- `captureElement: null` (or unset) — captures the viewport.
- `skip: { '<reason>': { in, kinds, stories } }` — marks the test skipped with `<reason>`. Note: `in` matches the **Playwright project name** (not the browser engine), so with the default project name `chromium`, a rule like `{ in: 'chrome' }` won't match — name your Playwright projects to line up with your `in:` rules, or scope rules via `kinds`/`stories`.
- `ignoreElements: '<selector>' | ['<selector>']` — masks those elements via `toHaveScreenshot({ mask })`.

Example:

```ts
// stories/MyModal.stories.tsx
export default {
  title: "MyModal",
  parameters: { creevey: { captureElement: "#storybook-root" } },
};

export const Default = {
  parameters: { creevey: { ignoreElements: ".timestamp" } },
};
```

**Prerequisites for running specs:** `@playwright/test` (peer dependency) and browser binaries (`npx playwright install`). The `crvy-strybk generate` command itself needs neither — only a running Storybook to fetch `index.json`. To run the same specs under Vitest Browser Mode instead, see [Vitest Browser Mode](#vitest-browser-mode): `vitest` + `@vitest/browser-playwright` (optional peers) and a built Storybook.

## Vitest Browser Mode

The same generated spec files run under either runner — no generator flag, no config change. `playwright test` and `vitest run` both discover `*.spec.ts` by default; the `@crvy/strybk` import resolves to the Playwright runtime in Node and to the Vitest runtime inside Vitest Browser Mode (via the `browser` package export condition). Pick a runner by choosing which command you execute.

Requirements and wiring:

1. **Build your Storybook.** The Vitest path serves `storybook build` output through a proxy; dev-mode Storybook servers are not supported (their absolute vite dev asset URLs cannot resolve under the proxy). The dev loop stays on Playwright.

   ```sh
   npx storybook build
   npx http-server storybook-static -p 6007   # or any static server
   ```

2. **Wire the proxy plugin** in `vitest.config.ts`. It mounts the Storybook origin under a reserved prefix (default `/storybook`, configurable) on the Vitest dev server so the embedded preview iframe is same-origin:

   ```ts
   import { strybkStorybookProxy } from "@crvy/strybk/vite";
   import { playwright } from "@vitest/browser-playwright";
   import { defineConfig } from "vitest/config";

   export default defineConfig({
     plugins: [strybkStorybookProxy({ target: "http://127.0.0.1:6007" })],
     test: {
       browser: {
         enabled: true,
         provider: playwright(),
         headless: true,
         instances: [{ browser: "chromium", viewport: { width: 1280, height: 720 } }],
       },
       provide: { strybkBrowser: "chromium" },
     },
   });
   ```

   Reserve the prefix: requests under `/storybook` are proxied to the target, so keep it free of your own routes (or pass a different `prefix`).

3. **Provide the browser identity** (`strybkBrowser`) so `skip` `in:` rules match like Playwright project names — the default is `chromium`. Optionally provide `strybkGlobals` (applied to the preview through the Storybook channel before capture), mirroring the Playwright path's `storybookGlobals` project metadata.

Notes:

- Baselines live under `__screenshots__/` next to the specs. The first run writes the baseline and fails ("No existing reference screenshot found; a new one was created"); seed baselines without failing with `vitest run --update`. Each runner keeps its own baseline tree — do not share them across runners.
- Capture parity is pinned by the runtime: CSS-pixel scale (`scale: "css"`), Playwright's default comparator threshold (`0.2`), and animations disabled. One caveat: keep the instance viewport within the headless browser window — Vitest scales its tester iframe when the viewport does not fit, which shrinks captures (this affects Vitest's own `page.screenshot()` identically).

## Upgrading from 0.0.x

`metadataExtractors` has been removed. `skip` and `captureElement` now resolve automatically at runtime — remove any `metadataExtractors: ["creevey"]` line from your `strybk.config.ts` and re-run `crvy-strybk generate`. Skipped stories now appear as `skipped` in Playwright reports rather than being omitted from the spec file.

## Changelog

Preview the next changelog entry:

```sh
bun run changelog:preview
```

Regenerate the full changelog from git history:

```sh
bun run changelog:generate
```

## Local Linking

Build the package:

```sh
bun run build
```

Register this package for local linking:

```sh
cd /path/to/strybk
bun link
```

Link it into the consumer project:

```sh
cd /path/to/consumer-project
bun link @crvy/strybk
```

If you want to persist the link in the consumer's manifest, Bun supports a `link:` dependency entry:

```json
{
  "dependencies": {
    "@crvy/strybk": "link:strybk"
  }
}
```

## Development

Install dependencies with Bun:

```sh
bun install
```

Common local commands:

```sh
bun run lint
bun run typecheck
bun run test:bun
bun run build
bun run check
```
