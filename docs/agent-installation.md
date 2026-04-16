# Agent Installation Guide

This document is written for an AI coding agent helping a human install and configure FCoding. Treat the human as the holder of secrets and console access. Never ask the user to paste secrets into tracked files, README snippets, commit messages, issue comments, or logs.

## Objective

Set up FCoding so a Feishu bot can receive direct messages through Feishu long connection, run local Codex CLI tasks, send progress/result replies, and receive interactive card callbacks.

## Ground Rules

- Keep secrets only in `.env` or the user's shell environment.
- Confirm `.env`, `.env.*`, and `.codex` are ignored before writing local credentials.
- Do not print `FEISHU_APP_SECRET`, tokens, or full `.env` contents.
- Prefer Feishu long connection mode. It does not need a public HTTPS service.
- Commit and push only source, tests, docs, and safe templates.
- After each feature or config-sensitive change, run `npm test`.

## Prerequisites To Check

Run:

```bash
node --version
npm --version
command -v codex
git status --short
```

Expected:

- Node.js is `>=20.11`.
- `codex` is installed and authenticated for the OS user running this service.
- The worktree has no unexpected local changes. If it is dirty, inspect before editing.

## Feishu Console Setup

Guide the human through the Feishu developer console:

1. Create or open a self-built Feishu app.
2. Enable bot capability.
3. In the bot settings, enable direct/private chat if the user wants one-on-one bot interaction.
4. In permissions, grant at least:
   - receive messages
   - send messages as bot
5. In Events and Callbacks, set subscription mode to long connection.
6. Subscribe to:
   - `im.message.receive_v1` for message receive events
   - `card.action.trigger` for interactive card callbacks
7. Save the configuration.
8. Publish/release the app if Feishu requires an app version or admin approval.
9. Add the bot to the target user/chat and make sure the app is enabled in the tenant.

Important: a successful long-connection status check does not mean every event is subscribed. If card clicks show Feishu error `200340` and the local service receives no `card.action.trigger` log, check that `card.action.trigger` is subscribed.

## Local Secret File

Create `.env` from the safe template:

```bash
cp .env.example .env
```

Ask the human for these values one by one, then write them to `.env`:

```dotenv
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_EVENT_MODE=ws
BOT_TRIGGER_PREFIX=codex
CODEX_WORKDIR=/absolute/path/to/the/repo/codex/should/edit
CODEX_ARGS=exec --skip-git-repo-check --sandbox workspace-write
CODEX_PROGRESS_INTERVAL_MS=30000
```

For a private single-user setup, add allowlists after the first successful message reveals the user's IDs in logs or event payloads:

```dotenv
ALLOWED_OPEN_IDS=ou_xxx
ALLOWED_USER_IDS=
ALLOWED_CHAT_IDS=
```

Leave HTTP-only values empty unless explicitly configuring webhook mode:

```dotenv
FEISHU_VERIFICATION_TOKEN=
FEISHU_ENCRYPT_KEY=
FEISHU_VERIFY_SIGNATURE=false
```

## Install And Verify

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Start the service:

```bash
npm start
```

Expected startup signs:

```text
event-dispatch is ready
card-action-handle is ready
FCoding Feishu WS client started
[ws] ws client ready
```

Keep the process running. In the Feishu console, click the long-connection status check button.

## Smoke Tests

Ask the user to send a direct message to the bot:

```text
codex echo hello
```

Expected:

- The bot replies `Received. Codex is working on it.`
- The bot later replies with Codex output.

Then test card callbacks:

```text
codex cardtest
```

Click the returned card button. Expected local logs include:

```text
Received Feishu WS callback
Received Feishu card action callback
```

If the user gets `200340`:

- Confirm the service is still running and shows `ws client ready`.
- Confirm `card.action.trigger` is subscribed in Feishu.
- Confirm the user clicked a newly generated card, not an older card from before the subscription.
- Check whether logs show `card.action.trigger`. If not, the callback is not reaching FCoding.

## Production Notes

- Run the process under a dedicated OS user.
- Point `CODEX_WORKDIR` at a dedicated workspace.
- Use Feishu allowlists before exposing the bot to more users.
- Keep `.env` out of git.
- Use a process manager such as systemd, pm2, or a container supervisor if the bot must run continuously.

## Commit And Push Checklist

Before committing:

```bash
npm test
npm audit --json
git diff --check
git status --short
```

Confirm no secrets are staged:

```bash
git diff --cached
```

Commit a focused slice:

```bash
git add <safe-files>
git commit -m "<concise message>"
git push
```
