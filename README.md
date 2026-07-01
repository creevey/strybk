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
