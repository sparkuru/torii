# Design Torii Project Mainline

## Goal

Create `.trellis/mainline.md` as the durable, evidence-based control record
for delivering the Torii Firefox Browser MCP MVP after the completed Phase 0
pairing pipeline. It must enable safe continuation across task archives while
leaving product requirements, plans, checks, and history in Trellis tasks.

## Confirmed Facts

- The root [`prd.md`](../../../prd.md) defines the approved MVP: local,
  least-privilege Firefox automation through a paired MCP service, beginning
  with one-tab session and interaction capabilities.
- Phase 0 (local pairing pipeline) is archived at
  `.trellis/tasks/archive/2026-08/08-06-phase0-pairing-pipeline/`; its work
  commit `96c1ca1` records passing `npm run typecheck`, `npm test` (8 tests),
  `npm run build`, and an interactive Firefox addon smoke check, plus manual
  pairing/revocation evidence.
- The current worktree contains uncommitted changes to `.trellis/workflow.md`
  and `.trellis/spec/frontend/index.md`. The former already contains the
  Trellis Plus no-task Project Pulse policy. Those changes must be preserved.
- No `.trellis/mainline.md` exists. The remaining active bootstrap task is
  inconsistent with its unchecked PRD checklist, so it is not evidence that a
  product task is ready to resume.

## Requirements

1. Add `.trellis/mainline.md` using the Trellis Plus control-record structure:
   initiative, continuation policy, ordered work, and evidence/decisions.
2. Name the approved initiative and objective from the root product PRD without
   inventing new product scope or treating proposed work as an active task.
3. Represent Phase 0 as complete and list the Phase 1 work in dependency order
   at a granularity where each item can later become an independently planned,
   verified, and archived Trellis task.
4. Record the dirty-worktree warning and the stale bootstrap-task discrepancy
   so a later Project Pulse stops rather than starting product work silently.
5. Preserve the existing Project Pulse workflow customization; do not add a
   scheduler, hook, task-schema change, or product-code modification.
6. Use `guided` continuation: a Project Pulse may recommend one uniquely ready
   item, but only the owner may choose it and authorize its normal task
   lifecycle.

## Out of Scope

- Creating, starting, or implementing any Phase 1 product task.
- Altering the root product PRD, Phase 0 implementation, or archived evidence.
- Resolving or committing unrelated existing worktree changes.
- Enabling serial continuation without an explicit owner authorization.

## Acceptance Criteria

- [x] `.trellis/mainline.md` identifies the Torii MVP initiative, the Phase 0
      completion evidence, a continuation mode, and the next user decision.
- [x] Its ordered work covers the root PRD's remaining phases with dependency
      and readiness evidence, without claiming proposed work is already active.
- [x] The record makes the current dirty state and bootstrap discrepancy visible
      as stop conditions.
- [x] A forward read shows the default no-task behavior recommends a ready item
      only after the record's warnings are resolved and never creates product
      work in guided mode.
- [x] No product files, automation hooks, or task schemas are changed.

## Key Decisions

- Continuation mode is `guided`; serial authorization is explicitly absent.

## Proposed Ordered Work

The following are planning candidates, not created or active product tasks.

1. **Phase 1 — Session and owned-tab foundation:** add the session lifecycle,
   tab discovery/claiming, opening/navigation, stable error codes, and the
   broker-to-addon command boundary. It depends only on the completed Phase 0
   pairing boundary.
2. **Phase 1 — Snapshot and element-reference lifecycle:** add on-demand page
   injection, structured snapshots, short-lived element references, and
   invalidation after navigation or tab loss. It depends on a claimed-tab
   boundary from item 1.
3. **Phase 1 — Page action suite:** add click, type, keypress, selection,
   scrolling, waits, and screenshots, each constrained to the active session,
   claimed tab, and current snapshot/reference lifetime. It depends on items 1
   and 2.
4. **Phase 1 — User stop, observability, and MVP integration evidence:** add
   popup session/tab visibility and stop control, metadata-only auditing,
   cancellation behavior, and acceptance-focused Node/Firefox validation. It
   depends on items 1 through 3.
5. **Phase 2 — Robustness and risk-policy interfaces:** address reconnects,
   navigation interruption, addon/browser reload, sensitive-input and
   high-risk-action policy seams, and visible page-state indication. It depends
   on the Phase 1 MVP evidence.
6. **Phase 3 — Optional deep automation:** evaluate a WebDriver BiDi driver
   only after an explicit product need; it must preserve the established MCP
   contract. It is intentionally not ready now.

Before item 1 can be recommended as ready, a Project Pulse must first report
and receive direction on the uncommitted Trellis changes and the stale
bootstrap-task record.
