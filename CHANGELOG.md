# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2026-06-18

### Added

- Match stories by importPath and resolve globs via configDir
## [0.0.2] - 2026-06-11
## [0.0.1] - 2026-06-11

### Added

- Add lean config and generator core
- Support creevey skip metadata extraction
- Add Storybook channel driver and switchStory helper
- Add shared-page Playwright fixtures
- Add strybk CLI
- Simplify generated spec imports to use @crvy/strybk directly

### Documentation

- Correct Yarn 4 local link instructions
- Add minimal config example and improve fetch error message

### Fixed

- Default generated region marker in renderer
- Harden creevey metadata filtering
- Support meta-level creevey skip
- Harden Storybook channel driver
- Keep switch timeout through font readiness
- Preserve sharedPage fixture typing
- Hide internal worker page fixture
- Preserve built-in playwright fixture types
- Harden linked playwright runtime and generation

### Miscellaneous

- Bootstrap strybk package
- Align strybk bootstrap with plan
- Fix strybk bin entry
- Make strybk bootstrap manifest honest
- Tighten strybk bootstrap packaging
- Ignore strybk build artifacts
- Sync strybk lockfile
- Build strybk before packing
- Sync current workspace
- Align publish setup with crvy-rprtr
- Bump version to 0.0.1 and update bin field format
## [Unreleased]
