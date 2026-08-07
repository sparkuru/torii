# Backend Logging Guidelines

## Current Phase 0 convention

There is no logging dependency or structured logging format yet. The CLI emits
the required startup diagnostic directly to stderr because stdout is reserved
for MCP JSON-RPC:

```ts
process.stderr.write(
  `Torii broker listening at ws://${DEFAULT_BROKER_HOST}:${endpoint.port}.\n` +
    `Pair this Firefox addon once with code: ${runtime.pairingCode.value}\n`
);
```

Source: `apps/mcp-server/src/cli.ts`.

This startup pairing code is an intentional, short-lived stderr-only exception
to the general secret-redaction rule. It must not be copied into ordinary
runtime logs, MCP responses, stored state, or URLs.

## Rules for current code

- Use stderr only for process diagnostics; never use `console.log` or stdout
  diagnostics in the MCP process.
- Do not claim debug/info/warn/error levels, JSON records, correlation IDs, or
  a logging library are established conventions; none exists in Phase 0.
- Never log pairing tokens, non-expired pairing codes outside the startup
  display, page contents, form input, passwords, screenshots, or raw payloads.
- When adding observability later, define redaction and a structured event
  contract first; the product PRD requires metadata/result summaries rather
  than browser content.

## Verification evidence

`tests/phase0.test.ts` connects an MCP stdio client to the real CLI and proves
the protocol initialization succeeds without stdout diagnostics. The browser
broker contract additionally prohibits logging tokens/codes in its bad-case
example.
