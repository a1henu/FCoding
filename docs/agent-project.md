# Agent Project Guide

This document is written for AI coding agents that need to understand or extend FCoding.

## Project Purpose

FCoding bridges Feishu bot messages to local Codex CLI tasks:

1. Feishu delivers a subscribed event to this service.
2. FCoding validates and normalizes the event.
3. FCoding extracts a Codex prompt from the message.
4. FCoding acknowledges the message quickly.
5. Codex runs locally in `CODEX_WORKDIR`.
6. The bot replies with progress updates and the final result.

The default runtime is Feishu long connection through `@larksuiteoapi/node-sdk`. HTTP webhook mode is still available for deployments with a public HTTPS callback URL.

## Runtime Entry Points

- `src/index.js`
  - Loads `.env`.
  - Calls `loadConfig()`.
  - Creates `FeishuClient`.
  - Starts either long connection mode or HTTP mode.
  - Handles SIGINT/SIGTERM shutdown.

- `src/config.js`
  - Parses environment variables.
  - Owns defaults for Codex command, args, timeout, output limits, and Feishu mode.

- `src/dotenv.js`
  - Lightweight local `.env` loader.
  - Does not overwrite variables already exported by the shell.

## Feishu Layer

- `src/feishu/client.js`
  - Fetches and caches tenant access tokens.
  - Sends text replies.
  - Sends interactive card replies.
  - Splits long replies where needed.

- `src/feishu/events.js`
  - Parses Feishu payloads.
  - Handles URL verification payloads.
  - Extracts text messages.
  - Strips Feishu mention markup.
  - Applies allowlists and `BOT_TRIGGER_PREFIX`.
  - Deduplicates event IDs.

- `src/feishu/crypto.js`
  - Verifies HTTP callback signatures.
  - Decrypts encrypted Feishu callback payloads.
  - Mostly relevant to HTTP webhook mode.

- `src/feishu/cards.js`
  - Builds interactive cards used by smoke tests and card callback responses.

- `src/feishu/ws.js`
  - Starts the official Feishu `WSClient`.
  - Creates the normal `EventDispatcher`.
  - Creates a `CardActionHandler` for card callbacks.
  - Routes `im.message.receive_v1` to Codex task processing.
  - Routes `card.action.trigger` to card action handling.
  - Patches the SDK client to dispatch websocket frames with `type=card`, because the installed Node SDK only dispatches normal event frames by default.

## HTTP Mode

- `src/server.js`
  - Creates the HTTP server.
  - Exposes `GET /healthz`.
  - Handles `POST <FEISHU_CALLBACK_PATH>`.
  - Verifies/decrypts Feishu HTTP callbacks when configured.
  - Sends quick HTTP responses and runs Codex asynchronously.

HTTP mode is optional. The default user journey should use long connection because it avoids public HTTPS setup.

## Codex Layer

- `src/codex/runner.js`
  - Spawns the configured Codex command.
  - Appends the extracted prompt.
  - Captures stdout/stderr.
  - Enforces timeout.
  - Formats results for Feishu replies.
  - Truncates large output from the middle.

Default command shape:

```text
codex exec --skip-git-repo-check --sandbox workspace-write <prompt>
```

Do not reintroduce unsupported flags such as `--ask-for-approval` unless the installed Codex CLI supports them. Check `codex exec --help` before changing defaults.

## Message Flow In Long Connection Mode

1. `startWsEventClient()` starts `lark.WSClient`.
2. Feishu sends subscribed events over websocket.
3. The composite dispatcher in `createWsEventDispatcher()` checks the event type.
4. `im.message.receive_v1` is normalized with `normalizeWsMessageEvent()`.
5. `extractCodexTask()` filters mentions, prefixes, allowlists, and empty prompts.
6. The handler returns quickly and schedules `processCodexTask()` with `setImmediate()`.
7. `processCodexTask()` sends an ack, starts periodic progress replies, runs Codex, stops progress, and replies with the result.
8. `card.action.trigger` is routed to the SDK `CardActionHandler`.

## Callback Test Command

The special prompt:

```text
codex cardtest
```

sends an interactive card. Clicking the button should produce logs similar to:

```text
Received Feishu WS callback
Received Feishu card action callback
```

If Feishu shows `200340`, first check Feishu subscriptions. The app must subscribe to `card.action.trigger`; a healthy long-connection socket alone is not enough.

## Test Layout

- `test/config.test.js`: config parsing.
- `test/dotenv.test.js`: local `.env` loading.
- `test/codex-runner.test.js`: Codex process execution and formatting.
- `test/feishu-client.test.js`: Feishu API client behavior.
- `test/feishu-crypto.test.js`: signature and encryption logic.
- `test/feishu-events.test.js`: event parsing, prompt extraction, allowlists, dedupe.
- `test/feishu-cards.test.js`: card payload builders.
- `test/feishu-ws.test.js`: long connection dispatch, card callbacks, SDK card-frame patch.
- `test/server.test.js`: HTTP webhook mode.

Run all tests:

```bash
npm test
```

## Development Rules For Future Agents

- Keep changes small and covered by tests.
- Preserve `.env` secrecy.
- Do not commit local runtime files such as `.env`, `.env.*`, `.codex`, or `node_modules`.
- When touching Feishu event parsing, update both long connection and HTTP tests if behavior overlaps.
- When touching Codex command execution, test success, failure, timeout, and output truncation.
- When touching callback cards, test both payload shape and long-connection callback dispatch.
- If a behavior depends on current Feishu or Codex SDK details, inspect the installed package or official docs before changing it.

## Known Design Choices

- Event handlers return quickly to avoid Feishu callback retries.
- Codex runs asynchronously after the Feishu event is accepted.
- Long-running Codex tasks send periodic progress replies.
- The service is dependency-light and uses Node's built-in test runner.
- The app is intentionally local-first; production hardening should focus on process supervision, allowlists, and workspace isolation.
