# Change Safety

Use this file to choose coordination level before editing.

## Safe To Change

These areas are low-risk when changes are small and tested.

- `docs/` factual documentation updates.
- `test/` additions that do not remove assertions or introduce live network dependencies.
- `src/feishu/cards.js` new pure card builders with tests.
- `src/feishu/client.js` additive client helpers with mocked fetch tests.
- `src/codex/runner.js` formatting-only tweaks with tests.
- `.github/workflows/test.yml` comments or naming changes that do not alter commands.
- `.env.example` comments that do not change variable names or defaults.

Expected verification:

- targeted test file
- `npm test`
- `git diff --check`

## Change With Caution

These areas affect multiple modules or user-visible behavior.

- `src/config.js`
  - Changes env contract and defaults.
  - Requires `.env.example`, README, install docs, and config tests.

- `src/server.js`
  - Owns HTTP mode and shared `processCodexTask`.
  - Changes can affect WS mode indirectly and can alter built-in command handling.

- `src/commands.js`
  - User-facing runtime command protocol.
  - Commands bypass Codex and can change workspace/model behavior or cancel an active task.
  - `MODEL_CHOICES` is user-facing because it controls the `codex model` selection card.

- `src/runtime-state.js`
  - In-memory runtime overrides, active task cancellation, and temporary card state.
  - Changes can invalidate card callbacks, paginated output state, cancellation, or real Codex command options.

- `src/dotenv.js` and `src/index.js` dotenv loading
  - Startup secret file behavior.
  - Incorrect load behavior can break local `.env` configuration.

- `src/feishu/events.js`
  - Controls access to local Codex execution.
  - Allowlists and trigger parsing are security-sensitive.

- `src/feishu/client.js`
  - Feishu API payload mistakes are user-visible.
  - Token cache bugs can cause repeated failures.

- `src/codex/runner.js`
  - External process behavior can hang, lose full output, ignore cancellation, timeout incorrectly, or run wrong args.

- `.github/workflows/test.yml`
  - CI signal for every push and pull request.
  - Keep aligned with `package.json` scripts and Node version assumptions.

- `README.md` and `docs/agent-installation.md`
  - Setup docs directly influence whether users leak secrets or miss Feishu subscriptions.

Expected verification:

- targeted tests listed in `testing-playbook.md`
- `npm test`
- docs/config consistency check where applicable

## High-Risk / Requires Coordination

Do not edit these concurrently without explicit ownership.

- `src/feishu/ws.js`
  - Long connection dispatcher.
  - Card callback routing.
  - SDK card-frame patch using internal WS client methods.
  - Breakage can cause Feishu user-facing `200340` errors.
  - Model selection, output expand/collapse, and task cancellation callbacks all route through this file.

- `src/server.js#processCodexTask`
  - Shared by WS and HTTP paths.
  - Controls built-in commands, ack, progress, active task registration, Codex run, final reply, card state, cancellation, and failure reporting.

- `src/feishu/events.js#extractCodexTask`
  - Security boundary for who can trigger Codex.
  - Prompt extraction bugs can run unintended commands or ignore valid messages.

- `src/config.js` plus `.env.example`
  - Environment contract.
  - Incorrect defaults can break first-run setup or weaken safety.

- `package.json` and `package-lock.json`
  - Dependency updates can alter SDK internals and security posture.

- Future session/interaction state files
  - Once added, these will become coordination-critical because cards, Codex processes, and retries will depend on them.

- Current `src/runtime-state.js` if adding durable storage or multi-user session semantics.
  - This would change the meaning of existing runtime commands and card callbacks.

Expected verification:

- full `npm test`
- relevant manual smoke test if `.env` is configured
- `npm audit --json` for dependency changes
- CI workflow review if `.github/workflows/test.yml` changed
- documented decision update in `docs/agent-context/decisions.md` when behavior changes

## Files That Must Stay Untracked

- `.env`
- `.env.*` except `.env.example`
- `.codex`
- `.codex/`
- `node_modules/`

Before commit:

```bash
git status --short
git diff --cached
```

Look for secrets, local paths that should not be shared, and generated files.

## Manual Smoke Tests By Risk

### Long Connection Message Flow

Use when changing WS dispatch, event parsing, config, or Feishu client replies:

```bash
npm start
```

Send a direct message:

```text
codex echo hello
```

Expect ack and final reply.

### Card Callback Flow

Use when changing cards or callback routing:

```text
codex cardtest
```

Click the button. Expect local logs containing `card.action.trigger`.

### HTTP Mode

Use when changing HTTP server or crypto:

```bash
FEISHU_EVENT_MODE=http npm start
curl http://127.0.0.1:3000/healthz
```

Full Feishu HTTP callback validation requires a public HTTPS endpoint and is not part of the default local smoke test.
