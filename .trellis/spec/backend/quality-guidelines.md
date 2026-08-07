# Backend Quality Guidelines

## Baseline

Use strict TypeScript with ESM. Root `tsconfig.json` enables `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and
`verbatimModuleSyntax`. Imports of types use `import type`, as in
`apps/mcp-server/src/broker.ts`.

The configured root checks are:

```sh
npm run typecheck
npm test
npm run build
```

There is no configured linter or CI workflow. Do not report a lint or CI pass.

## Required review and test coverage

- Add or update `tests/phase0.test.ts` for pairing/session/broker behavior.
  Existing tests exercise both pure manager behavior and real loopback
  WebSocket/MCP stdio integration.
- Validate all boundary messages through shared Zod schemas from
  `packages/contracts`; test the rejection path as well as the success path.
- For persistence changes, test hash-only contents, `0700` directory mode,
  `0600` file mode, atomic removal on revocation, and filesystem failures as
  appropriate.
- For transport/security changes, preserve loopback-only binding, a fixed
  production port unless explicitly configured, token revocation closing active
  sockets, and stderr-only diagnostics. Read
  `browser-broker-contract.md` as part of that review.

## Forbidden patterns

- `any`, unchecked casts at protocol boundaries, or duplicate message types.
- Broad network binding, automatic fallback ports, plaintext token persistence,
  or protocol diagnostics on stdout.
- Tests that mock away the boundary being changed when a focused integration
  test is practical; `tests/phase0.test.ts` uses a real `ws` client and an MCP
  stdio child process for this reason.
