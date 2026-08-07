# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for frontend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Current (Firefox addon) |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Current (native popup) |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | Current (no hook framework) |
| [State Management](./state-management.md) | Local state, global state, server state | Current (popup/background/storage) |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Current (Phase 0) |
| [Type Safety](./type-safety.md) | Type patterns, validation | Current (strict TypeScript) |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.

---

### Trellis Plus: Project Validation Profile

- Required automated checks before submit-ready: `npm run typecheck`, `npm test`, and `npm run build` from the repository root.
- No lint command or CI workflow is currently configured; do not claim either as passing.
- Addon smoke check: `npm run addon:smoke` starts the built addon with `web-ext run --source-dir apps/firefox-addon/dist --firefox firefox --browser-console`. It requires Firefox and a usable graphical environment, so it is targeted human/manual evidence rather than an automated assertion.
- Risky pairing, permission, storage, revocation, or security changes require a concrete manual Firefox pairing/revocation path when the runnable checks do not exercise the behavior.

### Trellis Plus: Playwright Validation Profile

- execution mode: not configured; the only current browser workflow is the interactive, project-local `web-ext` Firefox addon smoke command.
- setup/install: `npm install`; no `@playwright/test` dependency or Playwright browser bootstrap exists.
- app readiness: `npm run build` creates `apps/firefox-addon/dist`; `npm run addon:smoke` loads that directory into Firefox. There is no HTTP base URL or local web-server readiness endpoint.
- focused test command: none configured. For each popup or extension-runtime change, classify whether focused browser automation is effective before adding it; do not describe `addon:smoke` as a Playwright pass.
- full/CI browser command: none configured; no CI workflow exists.
- test location and config: no Playwright config or browser-test directory. Current unit tests are `tests/phase0.test.ts`, run through `npm test`.
- browser projects and supported viewports: Firefox only through `web-ext` with a temporary profile; no deterministic viewport policy is configured.
- fixtures and test-data boundary: no browser fixtures, seeded accounts, storage state, or network mocks are configured. Use disposable local broker state and one-time pairing codes for manual checks.
- accessibility policy: popup markup uses native labels, buttons, and a status region; no automated accessibility scan is configured.
- visual baseline policy: diagnostic-only; no approved screenshot baseline exists.
- failure artifacts: interactive Firefox browser-console output from `web-ext`; no saved Playwright report, trace, screenshot, or network artifact location is configured.

For browser-accessible addon work, prefer reproducible focused coverage when
the extension runtime and acceptance criteria make it effective. Otherwise
record `playwright-not-effective` or `playwright-unavailable`, the concrete
reason, and the smallest manual Firefox check that replaces it. A passing
manual smoke check does not remove review required for subjective visual,
real-device, private-environment, or security-sensitive risk.
