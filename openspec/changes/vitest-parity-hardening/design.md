# Design: vitest-parity-hardening

## Context

See `proposal.md` — Why. Governing facts from the investigation (all verified against installed packages and the manual harness):

- vitest 4.0.18's `createTaskCollector` never assigns `describe` to the collector returned by `test.extend()`; vitest 4.1+ assigns `taskFn.describe = suite` / `taskFn.suite = suite`. The 0.0.8 runtime copies own members from the extended collector, so under 4.0.x there is nothing to copy and `test.describe` is `undefined`.
- strybk's browser harness (outside the repo, results recorded in `openspec/changes/vitest-runtime-agnostic-tests/tasks.md`) exercised vitest 4.1.11 only, while `package.json` peers declare `vitest >=4 <5`.
- `vitest/browser` locators expose `click`, `dblClick`, `hover`, `fill`, `clear`, `press`, `type`, `nth`, `first`, `last` and `dropTo`; the `@vitest/browser-playwright` provider types `dropTo` options as Playwright's `Page['dragAndDrop']` options and implements it with `frame.dragAndDrop`. There is no `mouse` on `BrowserPage`.
- TypeScript resolves the `default` export condition (`moduleResolution: bundler`, no `customConditions`), so consumers typecheck generated code against the Playwright branch d.ts, not the vitest branch.

## Goals / Non-Goals

**Goals:**

- Generated specs collect and run under every vitest 4.x minor the package claims to support, starting at 4.0.x.
- The whole generated vocabulary (`describe`, `test`, `expect`, `switchStory`, fixtures) is provided by `@crvy/strybk` in both runtimes, with no dependence on runner collector internals.
- Manual regions that stay inside the documented interaction subset run under both runners without edits.

**Non-Goals:**

- Full Playwright `Page`/`Locator` emulation, including `sharedPage.mouse`, `waitForLoadState`, and web-first element assertions.
- Making the browser branch visible to consumer `tsc` runs (a neutral types entry is a separate concern).
- Changing the peer range, exports map, bin, or runtime dependencies.
- rprtr scanner support for the facade's `toHaveScreenshot` call sites (separate rprtr change).

## Decisions

### 1. Bridge the collector by feature detection, in a pure module

The runtime keeps using the underlying collector member when present and falls back to vitest's `describe` only when it is missing:

```
stitched collector = copyOwnMembers(test.extend(...))
                     + skip bridge (unchanged)
                     + describe: source.describe ?? vitestDescribe
```

Alternatives rejected: unconditional override of `describe` (would shadow a future runner-aware collector and diverge from 4.1 behavior that is already verified); version sniffing (couples to version strings and still needs the fallback).

The copy/override logic moves out of `src/vitest/index.ts` into a new `src/vitest/collector.ts` that imports nothing from `vitest`. `index.ts` cannot be imported by `bun test` because it imports `vitest` and touches the runner, so the assembly has never had in-gate coverage. No dependency is added; together with the pure locator factory from Decision 3 these are the only new modules.

### 2. `describe` becomes a package export, and the generator emits it

- Playwright runtime (`src/playwright/index.ts`): `export const describe = test.describe;`, re-exported from `src/index.ts`.
- Vitest runtime (`src/vitest/index.ts`): `export { describe } from "vitest";` — the module-level suite collector, identical to what `test.extend()` supplies on 4.1.
- Generator (`src/generate/render.ts`): the import line becomes `import { describe, test, expect, switchStory } from '@crvy/strybk';` and `wrapInDescribes` emits `describe(...)`.

Rationale: the package — not the runner's collector shape — owns the generated vocabulary. Suite and test names are unchanged (`describe` titles are the same strings), so baseline paths do not move; the `test.describe` bridge in Decision 1 keeps un-regenerated files and hand-written manual regions working. Alternative rejected: fixing only the runtime (smaller, no regen) — it leaves the contract implicit and the runner's collector as the hidden dependency that caused this regression.

### 3. Locator parity is an explicit adapter subset, not a proxy

`StrybkPageAdapter.locator()` returns an adapter instance (class, not the current plain object) whose methods delegate to the wrapped vitest locator:

| Portable method                               | Vitest mapping                                                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `click`, `dblClick`, `hover`, `fill`, `clear` | same-named vitest locator method, options passed through                                                                                                                                |
| `press`, `type`                               | `userEvent.type(vitestLocator, ...)`: `type` passes the text through; `press` converts Playwright key chords to testing-library keyboard syntax (`Control+A` → `{Control>}A{/Control}`) |
| `nth`, `first`, `last`                        | same-named vitest locator method, re-wrapped so masks and captures keep the adapter shape                                                                                               |
| `locator(selector)`                           | `vitestLocator.getByCSS(selector)` — the registered selector engine scopes the nested search                                                                                            |
| `dragTo(target, options)`                     | `vitestLocator.dropTo(target.vitestLocator, options)`; options typed as `{ sourcePosition?, targetPosition?, force?, timeout? }`                                                        |

`press` and `type` cannot delegate to the locator: vitest locators expose neither across 4.0–4.1 (verified against @vitest/browser 4.0.18 and the installed 4.1.11). The adapter therefore takes an injected `userEvent` dependency — the class in `pageAdapter.ts` supplies the real `userEvent` from `vitest/browser`.

`isStrybkLocator` keeps its structural check (`selector` + `vitestLocator`) so masks and `toPreviewLocator` continue to work with nested/`nth` locators. The portable construction is extracted into `src/vitest/locatorAdapter.ts`, a factory over a structural locator interface that imports types only, so `bun test` drives it with a fake locator while the class in `pageAdapter.ts` stays the vitest-coupled wiring. Alternative rejected: a `Proxy` that forwards every `Locator` member — it hides the boundary, cannot be typed honestly against Playwright's `Locator`, and would let consumers use APIs that are not portable. `sharedPage.mouse` is explicitly not emulated; the README documents `locator('body').hover({ position })` as the portable replacement for pointer positioning (the playwright provider augments hover options with Playwright's).

### 4. Minimum-version verification without a browser CI job

In-gate: `tests/vitest-collector.test.ts` drives the pure assembly with a fake collector that lacks `describe` and asserts fallback, override of `skip`, and preservation of copied members. Browser-mode verification stays out of the automated gate (repo convention, documented in the previous change): the manual harness checklist gains a run on the oldest supported vitest 4.x minor (4.0.x) that records collection, capture, and skip results next to the existing 4.1.11 results. The peer range stays `vitest >=4 <5`; README states the tested versions.

### 5. Sequencing with the open change

`vitest-runtime-agnostic-tests` holds the capability's only delta spec and an unarchived task. This change's MODIFIED requirements apply on top of that archive: archive `vitest-runtime-agnostic-tests` first, then implement and archive this change.

## Risks / Trade-offs

- [Vitest 4.0.x may differ beyond `describe` (provider options, screenshot matcher details)] → The min-version harness run exercises collection, capture, mask, skip, and naming; the assertion layer was re-checked against 4.0.18's matcher option types during exploration.
- [`dragTo` cannot express every Playwright drag nuance] → The subset accepts Playwright position options and maps to `dropTo`; the harness drag scenario (target position `{x:0, y:0}`) is part of the min-version checklist.
- [Regeneration churn in consumers] → Baselines and names are unchanged, un-regenerated files keep working through the bridge, and release notes call out the optional regen.
- [Consumer `tsc` still typechecks against the Playwright branch] → Documented; the generated vocabulary is a subset both branches satisfy, and the adapter subset is unit-tested on the vitest side.
- [Stateful module-scope collector assembly] → Unchanged pattern; the pure module makes the assembly testable per input instead of relying on the harness.
