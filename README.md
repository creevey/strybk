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

Build the package and register the local binary:

```sh
yarn build
yarn link
```

Link it into another project:

```sh
yarn link strybk
```

When you are done testing locally, remove the link from the consumer project with `yarn unlink strybk` and from this package with `yarn unlink`.