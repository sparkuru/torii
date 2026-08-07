# Trellis Mainline

## Initiative

- title: Torii Firefox Browser MCP MVP
- parent task: none
- objective: Deliver local, least-privilege Firefox automation through the
  paired Torii MCP service, starting with a user-authorized single-tab MVP.
- owner decision required: the root product PRD supplies the objective;
  the owner must choose a ready item and authorize its normal task lifecycle.

## Continuation

- mode: guided
- serial authorization: none
- next pulse: no-task

## Ordered Work

| order | task / proposed child | state | readiness and dependency evidence |
| --- | --- | --- | --- |
| 0 | Phase 0 — Local pairing pipeline | complete | Archived at `.trellis/tasks/archive/2026-08/08-06-phase0-pairing-pipeline/`; commit `96c1ca1` records the loopback pairing boundary and Phase 0 validation. |
| 1 | Phase 1 — Session and owned-tab foundation | active | Task `.trellis/tasks/08-07-phase1-session-owned-tab-foundation/` is in implementation. It follows completed Phase 0 and resolved bootstrap guidance; its remaining gate is the documented manual Firefox runtime path. |
| 2 | Phase 1 — Snapshot and element-reference lifecycle | planned | Depends on item 1's session, claimed-tab, navigation, and command boundary. |
| 3 | Phase 1 — Page action suite | planned | Depends on items 1 and 2; actions must use the active session, claimed tab, and current element-reference lifetime. |
| 4 | Phase 1 — User stop, observability, and MVP integration evidence | planned | Depends on items 1–3; completes popup visibility/stop control, metadata-only audit, cancellation, and targeted Node/Firefox acceptance evidence. |
| 5 | Phase 2 — Robustness and risk-policy interfaces | planned | Depends on Phase 1 acceptance evidence; covers reconnects, interruptions, reloads, sensitive-input/high-risk policy seams, and page-state indication. |
| 6 | Phase 3 — Optional WebDriver BiDi driver | blocked | Requires a future explicit product need; must preserve the established MCP contract. |

## Evidence and Decisions

- completed evidence: Phase 0 archive; work commit `96c1ca1`; documentation
  commit `62227f4`; bootstrap-guideline completion `d62eef0` and archive
  `689ea9f`. Phase 0 records `npm run typecheck`, `npm test` (8 tests),
  `npm run build`, `npm run addon:smoke`, and manual pairing/revocation
  verification.
- current blocker / dirty-state warning: no unrelated dirty worktree state.
  Phase 1 must still receive the task-specific manual Firefox runtime evidence
  before it is submit-ready; its automated checks and addon-loading smoke have
  passed.
- next user decision: perform and report the task's manual Firefox path, then
  decide whether to commit/archive the verified Phase 1 foundation.
