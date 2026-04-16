# docs AGENTS.md

## Responsibility

`docs/` contains durable human-facing and agent-facing context. These files should reduce dependence on chat history and make future handoffs safer.

## Key Files

- `agent-installation.md`: step-by-step installation guide for AI coding agents helping a human configure FCoding.
- `agent-project.md`: compact architecture guide for AI coding agents.
- `agent-context/project-map.md`: deeper project map and task entry points.
- `agent-context/current-plan.md`: suggested parallel work plan.
- `agent-context/decisions.md`: recorded design decisions and inferred conventions.
- `agent-context/open-questions.md`: important uncertainties.
- `agent-context/testing-playbook.md`: verification matrix by change type.
- `agent-context/change-safety.md`: risk map for files and interfaces.
- `.github/workflows/test.yml` is not under `docs/`, but docs about verification must match that workflow.

## Safe Changes

- Clarifying current behavior with exact file references.
- Adding verified operational lessons from real setup attempts.
- Updating command examples when scripts or config defaults change.
- Updating CI/testing docs when `.github/workflows/test.yml` changes.

## High-Risk Changes

- Documenting behavior that is not implemented.
- Including secrets, local tokens, or full `.env` values.
- Removing known caveats such as `card.action.trigger` subscription or SDK `type=card` frame handling.
- Letting README drift from `.env.example` or `src/config.js`.

## Minimum Verification

- Docs-only change: `git diff --check`; run `npm test` before commit unless there is a clear reason not to.
- Docs about config: compare with `.env.example` and `src/config.js`.
- Docs about runtime flow: compare with `src/index.js`, `src/server.js`, and `src/feishu/ws.js`.
- Docs about tests: compare with files in `test/`.
- Docs about CI: compare with `.github/workflows/test.yml` and `package.json`.

## Read Before Editing

- `../AGENTS.md`
- `../README.md`
- `agent-installation.md`
- `agent-project.md`
- Relevant source files for any behavior described
