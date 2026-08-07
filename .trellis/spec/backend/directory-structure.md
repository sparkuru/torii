# Backend Directory Structure

## Current Phase 0 layout

Torii is an npm TypeScript workspace. Its backend is deliberately small and
split by ownership rather than by a generic `src/` layer:

```text
apps/mcp-server/src/
  cli.ts       # process entry point and stderr-only diagnostics
  server.ts    # runtime composition and MCP stdio setup
  broker.ts    # loopback WebSocket transport and protocol dispatch
packages/contracts/src/index.ts  # shared constants, Zod schemas, message types
packages/session/src/index.ts    # pairing lifecycle and file-backed binding storage
tests/phase0.test.ts             # cross-package unit/integration coverage
scripts/build-server.mjs         # server bundle configuration
```

`apps/mcp-server` may depend on the reusable packages; `contracts` must remain
transport- and browser-independent, while `session` owns pairing state and
persistence. See the concrete composition in
`apps/mcp-server/src/server.ts` and message contract in
`packages/contracts/src/index.ts`.

## Adding code

- Put process wiring, environment parsing, and MCP setup in `apps/mcp-server`.
- Put values and wire schemas shared by broker and addon in `packages/contracts`.
- Put pairing/business state behind a small interface in `packages/session`.
  `FileBindingRepository` is the current example; tests use an in-memory
  implementation of the same `BindingRepository` interface.
- Keep transport parsing/connection bookkeeping in `broker.ts`; do not move
  domain state into WebSocket handlers.
- Use lower-case kebab-free file names matching the current modules
  (`broker.ts`, `server.ts`, `index.ts`) and named exports.

## Do not introduce

- A route/controller/service hierarchy: Phase 0 exposes MCP stdio and one
  loopback WebSocket broker, not HTTP routes.
- Firefox DOM or WebSocket imports in `packages/contracts` or
  `packages/session`; that would break their reuse boundary.
- A second source of protocol literals. Extend the schemas and constants in
  `packages/contracts/src/index.ts` first, then update both consumers.

## Evidence example

`startTorii` composes the persistence, domain manager, broker, and optional
stdio server, while `PairingBroker` only delegates pairing decisions:

```ts
const pairingManager = new PairingManager(new FileBindingRepository(defaultStateFile(stateDirectory)));
const broker = new PairingBroker({ pairingManager, port: options.port ?? DEFAULT_BROKER_PORT });
```

Source: `apps/mcp-server/src/server.ts`.
