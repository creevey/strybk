## MODIFIED Requirements

### Requirement: Generated spec files are runner-neutral

Generated spec files SHALL import `describe`, `test`, `expect`, and `switchStory` from `@crvy/strybk` and contain no runner-specific API calls, so the same file bytes are valid input for both `playwright test` and `vitest run` discovery (`*.spec.ts` is in both runners' default test-file patterns). Nesting SHALL use the package's `describe` (one nested describe per title segment, one `test` per story) and the `creevey` fixture wiring SHALL be unchanged. The CLI SHALL NOT gain runner selection flags or config fields; help text is unchanged.

#### Scenario: Generation output uses package vocabulary

- **WHEN** `crvy-strybk generate` runs
- **THEN** the emitted spec files import `describe`, `test`, `expect`, and `switchStory` from `@crvy/strybk`, nest suites with `describe(...)`, and contain no `test.describe`, no other runner-specific API calls, and no runner option in `--help`

#### Scenario: Generated shape change is regeneration-only

- **WHEN** a project regenerates specs after upgrading from the previous generator output
- **THEN** suite names, test names, and screenshot baseline paths are unchanged, and a project that does not regenerate keeps running because the runtime still accepts `test.describe`

#### Scenario: Both runners discover the same file

- **WHEN** a generated `*.spec.ts` exists in a project with both a Playwright config and a Vitest browser-mode config
- **THEN** both runners list the file's tests (one nested `describe` per title segment, one test per story) without extra include/exclude configuration

### Requirement: Dual-mode runtime export resolution

The `.` export of `@crvy/strybk` SHALL resolve through package export conditions: environments applying the `browser` condition (Vitest Browser Mode via Vite) receive the Vitest runtime, and Node receives the Playwright runtime. Both runtimes SHALL expose `describe`, `test`, `expect`, and `switchStory` with the same call signatures the generated code uses; the Playwright runtime SHALL expose `describe` as Playwright's `test.describe`, and the Vitest runtime SHALL register suites with Vitest's `describe` collector.

#### Scenario: Collected under Vitest Browser Mode

- **WHEN** a generated spec is imported by Vitest Browser Mode
- **THEN** `describe`, `test`, `expect`, and `switchStory` resolve to the Vitest runtime and the file's tests are collectable and executable

#### Scenario: Unchanged under Playwright

- **WHEN** a generated spec is run by `playwright test`
- **THEN** behavior is identical to the existing Playwright runtime in every observable respect (fixtures, params, assertions, baselines), with `describe` behaving as `test.describe`

## ADDED Requirements

### Requirement: Test collector surface is version-independent

The Vitest runtime SHALL expose a `test` collector whose `describe` method is callable on every supported vitest 4.x version, independent of whether `test.extend()` supplies one. Assembly SHALL NOT depend on collector members introduced after the minimum supported version, and SHALL preserve the collector methods the generated code relies on (`skip` with condition and reason, chainable modes, hooks). Collector assembly SHALL be covered by an in-gate unit test that simulates a collector without `describe`, and min-version behavior SHALL be confirmed by the manual browser harness on the oldest supported vitest 4.x minor.

#### Scenario: Collector without describe

- **WHEN** the runtime is assembled against a `test.extend()` collector that has no `describe` member
- **THEN** the exported `test.describe` registers a suite for the active runner and its nested tests collect and execute

#### Scenario: Collector with describe

- **WHEN** the underlying collector already provides `describe`
- **THEN** the runtime uses it and other collector members (`skip`, `only`, `todo`, hooks) keep their behavior

#### Scenario: Minimum supported vitest

- **WHEN** the manual browser harness runs the generated spec on the oldest supported vitest 4.x minor
- **THEN** all generated tests collect and run, and the result is recorded in the harness checklist

### Requirement: Portable interaction subset on sharedPage

The Vitest runtime's `sharedPage.locator(...)` SHALL return a locator exposing the portable interaction subset — `click`, `dblClick`, `hover`, `fill`, `clear`, `press`, `type`, `nth`, `first`, `last`, `locator`, and `dragTo` — with Playwright-compatible call signatures for that subset, and `sharedPage` SHALL keep `waitForTimeout`. `dragTo` SHALL accept Playwright-style source and target position options. APIs outside the subset (for example `sharedPage.mouse` and web-first element assertions) SHALL remain Playwright-only, and the README's Vitest Browser Mode section SHALL enumerate both the subset and the Playwright-only APIs.

#### Scenario: Element actions delegate to the preview

- **WHEN** a manual-region test calls `.nth(i)`, `.click()`, `.hover()`, or `.fill(text)` on a locator obtained from `sharedPage.locator(...)`
- **THEN** the action is performed on the matching element inside the embedded Storybook preview and awaits provider completion

#### Scenario: Nested locators scope the search

- **WHEN** `.locator(selector)` is called on an existing locator
- **THEN** the returned locator resolves matches inside the parent locator's elements only

#### Scenario: Drag with target position

- **WHEN** `.dragTo(target, { targetPosition })` is called
- **THEN** the drag runs with the same target-position semantics as the Playwright path, and the subsequent capture is stable

#### Scenario: Playwright-only APIs are documented

- **WHEN** a consumer reads the README's Vitest Browser Mode section
- **THEN** the portable subset and the APIs that remain Playwright-only are both explicitly listed
