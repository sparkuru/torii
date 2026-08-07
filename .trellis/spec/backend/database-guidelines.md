# Database and Persistence Guidelines

## Current Phase 0 state

There is no database, ORM, query layer, migration system, or database naming
convention in this repository. Do not introduce one for pairing state.

The only server-side persistence is one JSON binding record managed by
`FileBindingRepository` in `packages/session/src/index.ts`. It contains a
token hash and creation timestamp, not a raw token:

```ts
this.binding = { tokenHash: hashSecret(token), createdAt: this.now().toISOString() };
await this.repository.save(this.binding);
```

The default file is `binding.json` under the configured Torii data directory;
the directory is chmod `0700` and the record is atomically written through a
random temporary file then renamed with mode `0600`.

## Repository pattern

- Depend on the `BindingRepository` interface in domain code.
- Keep filesystem details in `FileBindingRepository`.
- Treat a missing binding file as an unpaired state; propagate other filesystem
  failures instead of silently treating them as missing.
- Revoke by deleting the record through `clear()`. Do not retain revoked
  token hashes.

`tests/phase0.test.ts` supplies `MemoryRepository`, demonstrating the intended
test seam without a database fixture.

## Do not introduce

- Raw pairing tokens, codes, page data, or input values in the file.
- Best-effort non-atomic overwrites, permissive file modes, or a migration
  framework without a separately approved persistence requirement.
- SQL/table terminology as if it were an existing project convention.
