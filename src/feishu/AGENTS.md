# src/feishu AGENTS.md

## Responsibility

This directory owns all Feishu-specific behavior: inbound event parsing, long connection dispatch, HTTP callback crypto helpers, outbound Feishu API calls, interactive card payloads, and card action responses.

## Key Entry Files

- `ws.js`: long connection dispatcher, card callback routing, SDK card-frame patch.
- `events.js`: Feishu payload parsing, mention stripping, allowlists, task extraction, dedupe.
- `client.js`: tenant token cache and reply APIs.
- `cards.js`: interactive card builders for command results, model selection cards, running task cancel cards, task status, callback tests, and expandable output cards.
- `crypto.js`: HTTP webhook signature verification and encrypted payload decryption.

## Internal Dependencies

- `ws.js` depends on `events.js`, `cards.js`, `../server.js`, `../runtime-state.js`, and `../codex/runner.js`.
- `client.js` is called by both WS and HTTP task processing.
- `events.js` is used by both `server.js` and `ws.js` paths, though WS currently normalizes payloads first.
- `crypto.js` is only used by HTTP mode.

## Safer Changes

- Adding new card builders in `cards.js` with tests in `test/feishu-cards.test.js`.
- Adding new Feishu API client methods in `client.js` with mocked fetch tests. Current client methods include text replies, card replies, and interactive card updates.
- Adding parsing support for additional text shapes in `events.js` with unit tests.
- Improving logs in `ws.js` as long as secrets and full message content are not dumped.

## High-Risk Changes

- Editing `patchWsClientCardCallbacks` or `handleWsCallbackData` in `ws.js`; this compensates for installed SDK behavior where `type=card` frames are not dispatched by default.
- Editing model selection, expand/collapse, or cancel card callback handling; model selection mutates runtime model state, expand/collapse depends on `runtimeState.getCardState()`, and cancel depends on active task state.
- Editing `extractCodexTask`; it controls who can trigger local Codex execution.
- Editing allowlist semantics; empty allowlists currently mean "allow all" for that identifier type.
- Editing `replyText` splitting or `replyInteractiveCard`; incorrect Feishu reply payloads are user-visible.
- Editing `crypto.js`; only HTTP mode uses it, so regressions may be missed if only long connection is manually tested.

## Minimum Verification

- `ws.js`: `node --test test/feishu-ws.test.js test/server.test.js`.
- `events.js`: `node --test test/feishu-events.test.js test/server.test.js test/feishu-ws.test.js`.
- `client.js`: `node --test test/feishu-client.test.js`.
- `cards.js`: `node --test test/feishu-cards.test.js test/feishu-ws.test.js`.
- output expand/collapse cards: `node --test test/feishu-cards.test.js test/feishu-ws.test.js test/runtime-state.test.js`.
- model selection cards: `node --test test/feishu-cards.test.js test/feishu-ws.test.js test/server.test.js`.
- running task cancel cards: `node --test test/feishu-cards.test.js test/feishu-ws.test.js test/runtime-state.test.js test/server.test.js`.
- `crypto.js`: `node --test test/feishu-crypto.test.js test/server.test.js`.
- Before finalizing any Feishu behavior change: `npm test`.

## Read Before Editing

- `../../docs/agent-context/project-map.md`
- `../../docs/agent-context/decisions.md`
- `../../docs/agent-context/testing-playbook.md`
- The matching `test/feishu-*.test.js`

## Operational Notes

- Feishu long connection requires app credentials in `.env`.
- Card callbacks require `card.action.trigger` subscription. `im.message.receive_v1` alone is not enough.
- Feishu error `200340` during card click usually means callback delivery/configuration trouble; check local logs for `card.action.trigger`.
