# Current Plan

## Current State

The repository has a working baseline:

- Feishu long connection mode starts and can receive message events.
- Direct message flow works through `im.message.receive_v1`.
- Card callback smoke test works after subscribing `card.action.trigger`.
- HTTP webhook mode has tests but is not the primary deployment path.
- Codex execution is non-interactive and process-based.
- Tests are fast and local: currently 39 Node tests.
- Agent-facing installation and project overview docs exist.

The next phase is better suited to incremental feature work with focused tests, not broad refactoring. The highest-value feature area is interactive Codex sessions over Feishu cards, but that should be implemented in small slices.

## Suggested Parallel Work Lanes

### Lane A: Codex Interaction Protocol

Owner scope:

- `src/codex/runner.js`
- new files under `src/codex/` if needed
- `test/codex-runner.test.js`

Goal:

- Understand how to capture Codex CLI progress/events or interactive prompts.
- Avoid changing Feishu card UI in the same branch.

Coordination:

- Must agree on a stable internal event shape before Feishu UI work consumes it.

### Lane B: Feishu Card UX

Owner scope:

- `src/feishu/cards.js`
- card-related tests

Goal:

- Build reusable card payloads for status, choices, permissions, success, and failure.
- Keep card builders pure and testable.

Coordination:

- Do not change callback dispatch in `ws.js` without coordinating with Lane C.

### Lane C: Long Connection Callback Routing

Owner scope:

- `src/feishu/ws.js`
- `test/feishu-ws.test.js`

Goal:

- Add nonce/session routing for card actions.
- Add dedupe for repeated card clicks or Feishu retries.

Coordination:

- High-risk area. Avoid parallel edits to `ws.js`.

### Lane D: Access Control And Safety

Owner scope:

- `src/feishu/events.js`
- `src/config.js`
- `.env.example`
- relevant docs/tests

Goal:

- Make allowlist setup clearer and safer for production.
- Possibly support first-run ID discovery without leaving allowlists open.

Coordination:

- Coordinate with README and agent installation docs.

### Lane E: Documentation And Operations

Owner scope:

- `docs/`
- `README.md`
- no source code unless fixing doc drift

Goal:

- Add process manager examples, troubleshooting, and release checklist.

Coordination:

- Verify behavior against source before documenting.

## Work That Should Be Serial

- Changes to `src/feishu/ws.js` callback dispatch and SDK patch.
- Changes to `src/server.js#processCodexTask`.
- Changes to `src/config.js` defaults and `.env.example`.
- Changes to package dependencies or Node version assumptions.
- Any change that alters the message-to-Codex prompt contract.

These areas create cross-module behavior and can easily invalidate other agents' assumptions.

## Recommended Agent Split

For a multi-agent session:

1. One integration owner controls `src/feishu/ws.js` and task orchestration.
2. One Codex owner controls `src/codex/`.
3. One card/UI owner controls `src/feishu/cards.js`.
4. One docs/test owner updates docs and broad test coverage after the interfaces settle.

Use explicit file ownership in prompts. Avoid assigning two workers to the same source file.

## Conflict Reduction Rules

- Add new helpers rather than rewriting shared modules when possible.
- Keep tests in the matching test file for the owned module.
- If a new shared interface is needed, document it in `docs/agent-context/decisions.md` before multiple agents consume it.
- Merge order should put low-level contracts first: config/events/runner, then WS routing/cards, then docs.
- Run `git diff --check` and `npm test` before handing off.

## Near-Term Priorities

1. Add session/nonce state for card actions and retry-safe dedupe.
2. Define an internal representation for Codex progress, choices, and permission prompts.
3. Replace simple periodic text progress with richer status updates only after the internal event shape is tested.
4. Harden access control defaults or first-run setup guidance before wider deployment.
5. Add operational docs for running the service continuously.
