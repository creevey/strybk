## Purpose

Generated screenshot specs can execute under either Playwright or Vitest Browser Mode against the same generated files, rendering each story in a running (built) Storybook and capturing screenshots with runner-parity semantics.

## ADDED Requirements

### Requirement: Generated spec files are runner-neutral

Generated spec files SHALL import only `test`, `expect`, and `switchStory` from `@crvy/strybk` and contain no runner-specific API calls, so the same file bytes are valid input for both `playwright test` and `vitest run` discovery (`*.spec.ts` is in both runners' default test-file patterns). The CLI SHALL NOT gain runner selection flags or config fields; generated output and help text are unchanged from the Playwright-only behavior.

#### Scenario: Generation output is runner-independent

- **WHEN** `crvy-strybk generate` runs
- **THEN** the emitted spec files are byte-identical to what the Playwright-only version emits, and `--help` lists no runner option

#### Scenario: Both runners discover the same file

- **WHEN** a generated `*.spec.ts` exists in a project with both a Playwright config and a Vitest browser-mode config
- **THEN** both runners list the file's tests (one nested `describe` per title segment, one test per story) without extra include/exclude configuration

### Requirement: Dual-mode runtime export resolution

The `.` export of `@crvy/strybk` SHALL resolve through package export conditions: environments applying the `browser` condition (Vitest Browser Mode via Vite) receive the Vitest runtime, and Node receives the Playwright runtime. Both runtimes SHALL expose `test`, `expect`, and `switchStory` with the same call signatures the generated code uses.

#### Scenario: Collected under Vitest Browser Mode

- **WHEN** a generated spec is imported by Vitest Browser Mode
- **THEN** `test`, `expect`, and `switchStory` resolve to the Vitest runtime and the file's tests are collectable and executable

#### Scenario: Unchanged under Playwright

- **WHEN** a generated spec is run by `playwright test`
- **THEN** behavior is identical to the existing Playwright runtime in every observable respect (fixtures, params, assertions, baselines)

### Requirement: Story rendering through an embedded same-origin preview

Under Vitest, `switchStory` SHALL render the requested story inside an iframe embedded in the test document, pointed at the Storybook preview URL supplied by the Vite proxy mount, sized to the configured browser instance viewport. The embedded iframe SHALL be reused across tests within one spec file and SHALL be reachable same-origin so preview window state is readable.

#### Scenario: First story switch in a file

- **WHEN** a test calls `switchStory(sharedPage, storyId)` and no embedded preview iframe exists yet
- **THEN** the runtime creates the iframe at the mounted preview URL for that story, sized to the instance viewport, and completes once the story has rendered and fonts are ready

#### Scenario: Subsequent switches reuse the preview

- **WHEN** a later test in the same file switches stories
- **THEN** the switch happens through the preview's Storybook channel on the existing iframe, waiting for the story-rendered or story-unchanged event

#### Scenario: Story failure surfaces

- **WHEN** the preview reports a story error or rendering does not settle within the timeout
- **THEN** the test fails with the preview's error description or a switch timeout message, matching the Playwright path's failure text semantics

### Requirement: Runtime creevey parameter resolution under Vitest

`creevey.params(storyId)` SHALL resolve merged `parameters.creevey` (captureElement, skip, ignoreElements) from the running Storybook preview at test runtime by reading preview story state through the same-origin iframe, applying the same normalization rules (skip reason strings, captureElement default null, ignoreElements array) as the Playwright path. No Storybook addon or generate-time parameter inlining SHALL be required.

#### Scenario: captureElement resolves to element capture

- **WHEN** a story sets `parameters.creevey.captureElement` to a selector
- **THEN** the generated assertion captures that element inside the embedded preview

#### Scenario: skip rules match the Vitest browser identity

- **WHEN** a story sets `skip` with an `in:` rule and the Vitest browser instance provides its identity through the `strybkBrowser` provide key
- **THEN** the test is skipped with the rule's reason when the identity matches, exactly as Playwright project-name matching behaves

### Requirement: Browser identity and globals via per-instance provide

Under Vitest, the browser identity used for `skip` `in:` matching SHALL come from the instance `provide` key `strybkBrowser`, and Storybook globals SHALL come from the instance `provide` key `strybkGlobals`, applied to the embedded preview through the Storybook channel before capture. When a key is absent, the runtime SHALL fall back to documented defaults and not fail.

#### Scenario: Provided globals reach the preview

- **WHEN** an instance provides `strybkGlobals` and a test runs
- **THEN** the globals are applied to the embedded preview before the screenshot is taken

#### Scenario: Identity fallback

- **WHEN** an instance does not provide `strybkBrowser`
- **THEN** skip `in:` rules behave against the documented default identity and no error is raised

### Requirement: Screenshot assertion facade with Playwright parity

Under Vitest, the generated `expect(target).toHaveScreenshot({ mask })` call SHALL execute Vitest's screenshot assertion with: an explicit deterministic name derived from the story, mask entries converted to locators inside the embedded preview, capture scale pinned to CSS pixels, animations disabled, and comparator defaults aligned with the Playwright assertion defaults. When `captureElement` is unset, the capture target SHALL be the embedded iframe element itself.

#### Scenario: Viewport capture

- **WHEN** a story has no `captureElement`
- **THEN** the screenshot captures the embedded preview iframe element, equivalent to the Playwright path's viewport capture at the same dimensions

#### Scenario: Masked elements

- **WHEN** a story sets `ignoreElements`
- **THEN** the matched elements are masked in the comparison image

#### Scenario: First-run baseline behavior

- **WHEN** no baseline exists for a story under Vitest
- **THEN** the first run writes the baseline and fails the assertion (Playwright-like UX), and `vitest run --update` seeds baselines without failing

#### Scenario: Pixel-scale parity

- **WHEN** the same story is captured on a device-pixel-ratio greater than 1 display
- **THEN** the captured baseline dimensions match the Playwright path's CSS-pixel dimensions for the same viewport
