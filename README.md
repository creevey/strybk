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

**Prerequisites for running specs:** `@playwright/test` (peer dependency) and browser binaries (`npx playwright install`). The `crvy-strybk generate` command itself needs neither — only a running Storybook to fetch `index.json`.

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
