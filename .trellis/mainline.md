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
| 1 | Phase 1 — Session and owned-tab foundation | planned | Depends on completed Phase 0. It is blocked from recommendation while the current dirty Trellis state and stale bootstrap record remain unresolved. |
| 2 | Phase 1 — Snapshot and element-reference lifecycle | planned | Depends on item 1's session, claimed-tab, navigation, and command boundary. |
| 3 | Phase 1 — Page action suite | planned | Depends on items 1 and 2; actions must use the active session, claimed tab, and current element-reference lifetime. |
| 4 | Phase 1 — User stop, observability, and MVP integration evidence | planned | Depends on items 1–3; completes popup visibility/stop control, metadata-only audit, cancellation, and targeted Node/Firefox acceptance evidence. |
| 5 | Phase 2 — Robustness and risk-policy interfaces | planned | Depends on Phase 1 acceptance evidence; covers reconnects, interruptions, reloads, sensitive-input/high-risk policy seams, and page-state indication. |
| 6 | Phase 3 — Optional WebDriver BiDi driver | blocked | Requires a future explicit product need; must preserve the established MCP contract. |

## Evidence and Decisions

- completed evidence: Phase 0 archive; work commit `96c1ca1`; documentation
  commit `62227f4`; archived evidence records `npm run typecheck`, `npm test`
  (8 tests), `npm run build`, `npm run addon:smoke`, and manual
  pairing/revocation verification.
- current blocker / dirty-state warning: `.trellis/workflow.md` and
  `.trellis/spec/frontend/index.md` have uncommitted changes. In addition,
  `00-bootstrap-guidelines` remains marked `in_progress` despite unchecked
  checklist items in its PRD. Do not create or start Phase 1 work until the
  owner directs how to reconcile these records.
- next user decision: reconcile the uncommitted Trellis changes and decide
  whether the stale bootstrap task should be completed, corrected, or retired;
  then choose the recommended Phase 1 foundation task in a guided Pulse.
