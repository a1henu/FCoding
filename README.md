# FCoding

FCoding is a small Feishu bot bridge that lets a Feishu message trigger a local Codex CLI task and receive the result back in the same message thread.

The service uses only Node built-ins at runtime. It handles Feishu URL verification, request signature checks, encrypted callbacks, message parsing, duplicate event suppression, tenant access token caching, message replies, Codex process execution, timeouts, and output truncation.

## Requirements

- Node.js 20.11 or newer
- A working `codex` CLI on the machine running this service
- A Feishu custom app with bot capability enabled
- A public HTTPS URL that can reach this service, for example through a reverse proxy or tunnel

## Feishu App Setup

1. Enable the app bot in the Feishu developer console.
2. Add the message receive event, usually `im.message.receive_v1` / Receive Message v2.0.
3. Grant the app permission to receive and send single chat or group messages.
4. Configure the event request URL as `https://<your-domain>/feishu/events`.
5. Copy the app id, app secret, verification token, and encrypt key into your environment.
6. Publish or release the app according to your Feishu tenant requirements, then add the bot to the target chat.

Useful API references:

- Feishu message reply API: https://feishu.apifox.cn/api-58349897
- Feishu IM API overview: https://feishu.apifox.cn/doc-1944888
- Tenant access token endpoint path used by Feishu: `POST /open-apis/auth/v3/tenant_access_token/internal`

## Configuration

Copy `.env.example` values into your deployment environment. This project does not load `.env` automatically, so export the variables in your shell, process manager, container, or systemd unit.

Important variables:

- `FEISHU_APP_ID`, `FEISHU_APP_SECRET`: Feishu app credentials.
- `FEISHU_VERIFICATION_TOKEN`: checked against callback payload tokens.
- `FEISHU_ENCRYPT_KEY`: used for request signature validation and encrypted event payloads.
- `FEISHU_VERIFY_SIGNATURE`: defaults to true when `FEISHU_ENCRYPT_KEY` is present.
- `BOT_TRIGGER_PREFIX`: optional text prefix after the bot mention. With `codex`, a message like `@Bot codex run tests` sends `run tests` to Codex.
- `ALLOWED_OPEN_IDS`, `ALLOWED_USER_IDS`, `ALLOWED_CHAT_IDS`: comma-separated allowlists. Keep at least one allowlist in production.
- `CODEX_WORKDIR`: repository directory where Codex should work.
- `CODEX_ARGS`: arguments placed before the prompt. The default is `exec --skip-git-repo-check --sandbox workspace-write --ask-for-approval never`.

## Run Locally

```bash
npm test
npm start
```

Health check:

```bash
curl http://127.0.0.1:3000/healthz
```

Feishu should call:

```text
POST https://<your-domain>/feishu/events
```

## How It Works

1. Feishu sends an event callback to `POST /feishu/events`.
2. The server verifies the request signature when enabled and decrypts `encrypt` payloads when present.
3. URL verification callbacks receive `{ "challenge": "..." }` immediately.
4. Text message events are filtered through allowlists and `BOT_TRIGGER_PREFIX`.
5. The server returns `200` quickly, then runs Codex asynchronously.
6. The bot replies first with an acknowledgement, then with the Codex result or failure details.

## Security Notes

Codex can modify files in `CODEX_WORKDIR`, and the default arguments allow workspace writes without interactive approvals so the bot can finish unattended. Run this bridge under a dedicated OS user, point it at a dedicated workspace, keep Feishu signature verification enabled, and restrict callers with allowlists.

Do not expose this service without HTTPS and Feishu callback verification.

## Development Flow

This repository is intentionally dependency-light. Add code with focused tests, run `npm test`, and commit each completed feature slice.
