# strybk

Generator-first Playwright screenshot testing for Storybook.

## CLI

Generate screenshot specs from a Storybook index:

```sh
strybk generate --config ./strybk.config.ts
```

Use `--dry-run` to compute outputs without writing files:

```sh
strybk generate --config ./strybk.config.ts --dry-run
```

The config module should export a `StrybkConfig` object, typically as the default export from `defineConfig(...)`.

## Local Linking

Build the package:

```sh
yarn build
```

Link it from the consumer project using the path to this package:

```sh
yarn link /path/to/strybk
```

Use `yarn unlink /path/to/strybk` in the consumer project when you are done testing locally.