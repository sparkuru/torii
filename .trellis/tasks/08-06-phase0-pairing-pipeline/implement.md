# Phase 0 执行计划

## Implementation order

1. Create npm workspace metadata, strict TypeScript configuration, ignore rules,
   and scripts for build, test, addon smoke test, and local start.
2. Add `contracts` schemas/error codes and pure `session` pairing state machine
   with tests before any network or Firefox integration.
3. Implement state persistence with a test-injectable data directory and
   sensitive-value redaction helpers.
4. Implement the MCP stdio entry point and fixed loopback Broker. Keep MCP
   protocol stdout clean; make port conflicts fail visibly on stderr.
5. Add Broker integration tests for pairing/reconnect/revoke and the listener
   address/port constraints.
6. Implement the Manifest V3 addon background client, minimal popup, manifest
   permissions, and build packaging.
7. Add `web-ext` temporary-profile smoke command and README instructions for
   installation, pairing, revocation, and known manual validation.
8. Run the complete Node checks and addon smoke check; retain the exact result
   and any unavailable prerequisite in task evidence.

## Validation gates

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run addon:smoke`
- inspect the generated manifest for forbidden permissions
- manually pair and revoke once in a temporary Firefox profile when automation
  cannot drive the popup yet

The concrete commands are acceptance criteria only after the package scripts
exist and execute. Missing `web-ext`, browser launch restrictions, or dependency
installation failures must be reported as unavailable rather than passing.

## Rollback boundaries

- No existing source files are modified: deleting the new phase-0 workspace is
  a complete code rollback before any release.
- Do not preserve generated tokens, test state, or Firefox profiles in the
  repository.
- If the fixed port creates unacceptable usability issues, revert only the
  endpoint-discovery configuration; do not loosen the `127.0.0.1` binding.
