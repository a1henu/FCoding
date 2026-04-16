# Open Questions

## 1. How should interactive Codex prompts be represented internally?

Question: What event schema should FCoding use for Codex choices, permission prompts, tool approvals, progress, and final output?

Why it matters: Feishu cards need stable callback values and session routing. Without an internal schema, card UI and Codex runner changes will couple tightly and conflict.

Evidence seen: Current `runCodexTask()` is process-based and non-interactive. Current card callback handler only handles `fcoding_action: callback_test`.

Suggested next step: Prototype Codex CLI output modes in isolation. If `codex exec --json` or another server mode is used, write tests around parsed event fixtures before changing Feishu UI.

## 2. Can the installed Codex CLI support streaming status or thinking events?

Question: Which Codex CLI mode should FCoding use to observe progress beyond periodic "still working" text?

Why it matters: The user wants Feishu UX close to Codex CLI, including thinking/status and interactive decisions. The current runner only returns after process close.

Evidence seen: Current defaults use `codex exec --skip-git-repo-check --sandbox workspace-write`; prior `--ask-for-approval` was unsupported by the installed CLI.

Suggested next step: Inspect `codex exec --help`, `codex exec --json`, `codex app-server --help`, and `codex exec-server --help` in the target environment. Document the selected protocol before implementation.

## 3. What is the long-term state store for sessions and card nonces?

Question: Should FCoding store session state in memory, files, SQLite, Redis, or another backend?

Why it matters: Interactive cards require mapping a Feishu click back to a running Codex process/session. In-memory state is simple but lost on restart.

Evidence seen: Current project has no database or persistent state. `EventDeduper` is in-memory only.

Suggested next step: For local single-user use, start with in-memory state plus explicit docs. Revisit persistence before multi-user or long-running production use.

## 4. Should allowlists default closed?

Question: Should empty `ALLOWED_OPEN_IDS`, `ALLOWED_USER_IDS`, and `ALLOWED_CHAT_IDS` continue to mean allow all?

Why it matters: Codex can modify local files in `CODEX_WORKDIR`. Open allowlists are risky outside a trusted private setup.

Evidence seen: `src/feishu/events.js` currently treats empty allowlists as allow all. `.env.example` comments warn to leave empty only for trusted private deployment.

Suggested next step: Decide whether to keep developer-friendly defaults or require explicit first-run allowlist setup. If changing, update tests, README, and install docs.

## 5. What exact Feishu permissions are minimally required?

Question: Which Feishu permission scopes are strictly necessary for direct messages, replies, and interactive cards?

Why it matters: Setup failures are likely if users miss a scope. Docs currently describe capabilities at a high level rather than exact permission scope names.

Evidence seen: The local setup worked after enabling bot capability, message receive event, send-message capability, and card callback subscription. Exact scope names were not fully recorded in repo docs.

Suggested next step: Verify in Feishu developer console or official docs, then update `docs/agent-installation.md` with exact permission names.

## 6. Should card payloads use legacy card schema or JSON 2.0?

Question: Is the current card builder format the best long-term format for interactive flows?

Why it matters: Current smoke-test card works after `card.action.trigger` subscription, but future richer cards may benefit from newer schema features.

Evidence seen: Current `src/feishu/cards.js` uses `elements` with `action` and button `value`. A temporary JSON 2.0 experiment was not finalized because the existing card worked once callbacks were subscribed.

Suggested next step: Before building complex card UX, verify current Feishu card schema guidance and choose one format. Add payload tests for the selected format.

## 7. How should continuous operation be supervised?

Question: Should the recommended deployment use systemd, pm2, Docker, or another process manager?

Why it matters: `npm start` is enough for local testing but not durable operation.

Evidence seen: No process manager config exists. README only documents `npm start`.

Suggested next step: Add one documented production-ish path after deciding target environment.

## 8. Should HTTP mode remain first-class?

Question: Is HTTP webhook mode a maintained feature or a legacy fallback?

Why it matters: Maintaining both inbound modes increases test and design surface.

Evidence seen: HTTP mode is tested and implemented, but the user's target environment uses long connection due no public HTTPS service.

Suggested next step: Keep HTTP tests for now. Reassess after interactive WS features mature.
