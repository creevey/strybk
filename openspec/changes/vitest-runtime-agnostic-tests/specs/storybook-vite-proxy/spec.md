## Purpose

A Vite plugin export that mounts a built Storybook under a reserved prefix on the Vitest dev server, making the embedded preview same-origin so the Vitest runtime can read preview state and drive the Storybook channel.

## ADDED Requirements

### Requirement: Prefix proxy to a built Storybook origin

The `@crvy/strybk/vite` export SHALL provide a Vite plugin that proxies every request under a reserved prefix to a consumer-configured Storybook origin, stripping the prefix, so that the built Storybook's `iframe.html` and its relative assets resolve back under the same prefix. The prefix and target origin SHALL be configurable through plugin options with documented defaults.

#### Scenario: Preview loads through the mount

- **WHEN** the Vitest dev server receives a request for `<prefix>/iframe.html?id=<storyId>` and the configured origin serves built Storybook output
- **THEN** the response is the Storybook preview document and every relative asset it references resolves to a URL under the same prefix

#### Scenario: Custom target origin

- **WHEN** the plugin is configured with a different built-Storybook origin (for example a CI-hosted static server)
- **THEN** all prefix requests are served from that origin without code changes in the generated specs

### Requirement: Same-origin reachability for the runtime

The proxy mount SHALL make the embedded Storybook preview same-origin with the test document, such that the Vitest runtime can access the preview window's Storybook state and channel without cross-origin restrictions.

#### Scenario: Preview state is readable

- **WHEN** a generated test resolves `parameters.creevey` at runtime through the embedded preview
- **THEN** the read succeeds without cross-origin errors, because the preview is served from the Vitest dev server's own origin

### Requirement: Actionable failure when the mount is unusable

The plugin and runtime SHALL surface actionable errors when the mounted origin is not a built Storybook: requests under the prefix that fail SHALL propagate the upstream status, and the Vitest runtime SHALL fail tests with a message naming the unreachable preview URL and the built-output requirement, rather than a cross-origin or channel-unavailable error.

#### Scenario: Origin not serving built output

- **WHEN** the configured origin does not respond with built Storybook output for `iframe.html`
- **THEN** the affected tests fail with an error that names the preview URL and states that a built Storybook (`storybook build`) is required

#### Scenario: Dev-mode Storybook origin is documented as unsupported

- **WHEN** a consumer points the plugin at a dev-mode Storybook server
- **THEN** the README documents that dev servers are unsupported for the Vitest path and the Playwright path remains the dev-loop runner
