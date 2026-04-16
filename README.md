# FCoding

FCoding is a small Feishu bot bridge that lets a Feishu message trigger a local Codex CLI task and receive the result back in the same message thread.

The default runtime uses the official Feishu Node SDK for long-connection event delivery. The optional HTTP webhook mode still handles Feishu URL verification, request signature checks, encrypted callbacks, message parsing, duplicate event suppression, tenant access token caching, message replies, Codex process execution, timeouts, and output truncation.

## Requirements

- Node.js 20.11 or newer
- A working `codex` CLI on the machine running this service
- A Feishu custom app with bot capability enabled
- For the default long-connection mode: outbound internet access from this machine
- For optional HTTP webhook mode: a public HTTPS URL that can reach this service

## Feishu App Setup

1. Enable the app bot in the Feishu developer console.
2. In Events and Callbacks, choose the long-connection event subscription mode.
3. Add the message receive event, usually `im.message.receive_v1` / Receive Message v2.0.
4. Grant the app permission to receive messages and send messages as the bot.
5. Copy the app id and app secret into your local `.env`.
6. Start this service, verify the long-connection status in the Feishu console, then publish or release the app according to your tenant requirements.
7. Add the bot to the target chat.

Long-connection mode does not require a public HTTPS callback URL, verification token, or encrypt key. Those fields are only needed if `FEISHU_EVENT_MODE=http` is used.

Useful API references:

- Feishu message reply API: https://feishu.apifox.cn/api-58349897
- Feishu IM API overview: https://feishu.apifox.cn/doc-1944888
- Tenant access token endpoint path used by Feishu: `POST /open-apis/auth/v3/tenant_access_token/internal`

## Configuration

Copy `.env.example` to `.env` for local development. `npm start` loads `.env` automatically without overwriting variables already exported by your shell. `.env` and `.env.*` are ignored by git, while `.env.example` stays tracked as a safe template.

Important variables:

- `FEISHU_APP_ID`, `FEISHU_APP_SECRET`: Feishu app credentials.
- `FEISHU_EVENT_MODE`: use `ws` for Feishu long connection, or `http` for webhook callbacks.
- `FEISHU_VERIFICATION_TOKEN`: only used in HTTP webhook mode.
- `FEISHU_ENCRYPT_KEY`: only used in HTTP webhook mode for signature validation and encrypted event payloads.
- `FEISHU_VERIFY_SIGNATURE`: only used in HTTP webhook mode.
- `BOT_TRIGGER_PREFIX`: optional text prefix after the bot mention. With `codex`, a message like `@Bot codex run tests` sends `run tests` to Codex.
- `ALLOWED_OPEN_IDS`, `ALLOWED_USER_IDS`, `ALLOWED_CHAT_IDS`: comma-separated allowlists. Keep at least one allowlist in production.
- `CODEX_WORKDIR`: repository directory where Codex should work.
- `CODEX_ARGS`: arguments placed before the prompt. The default is `exec --skip-git-repo-check --sandbox workspace-write`.
- `CODEX_PROGRESS_INTERVAL_MS`: sends a periodic running-status reply while Codex is still working. Set to `0` to disable.

## Run Locally

```bash
npm test
npm start
```

For long-connection mode, keep `npm start` running and use the Feishu console button to verify the connection state.

To verify long-connection card callbacks, send this to the bot and click the returned card button:

```text
codex cardtest
```

Health check is available only in HTTP webhook mode:

```bash
curl http://127.0.0.1:3000/healthz
```

For HTTP webhook mode, Feishu should call:

```text
POST https://<your-domain>/feishu/events
```

## How It Works

1. In long-connection mode, the official Feishu SDK opens a WebSocket connection to Feishu and receives subscribed events locally.
2. In HTTP mode, Feishu sends an event callback to `POST /feishu/events`; the server verifies signatures and decrypts encrypted payloads when enabled.
3. Text message events are filtered through allowlists and `BOT_TRIGGER_PREFIX`.
4. Event handlers return quickly, then run Codex asynchronously so Feishu does not retry due to callback timeout.
5. The bot replies first with an acknowledgement, then with the Codex result or failure details.

## Security Notes

Codex can modify files in `CODEX_WORKDIR`, and the default arguments allow workspace writes without interactive approvals so the bot can finish unattended. Run this bridge under a dedicated OS user, point it at a dedicated workspace, and restrict callers with allowlists.

For HTTP webhook mode, do not expose this service without HTTPS and Feishu callback verification.

## Development Flow

This repository is intentionally dependency-light. Add code with focused tests, run `npm test`, and commit each completed feature slice.
